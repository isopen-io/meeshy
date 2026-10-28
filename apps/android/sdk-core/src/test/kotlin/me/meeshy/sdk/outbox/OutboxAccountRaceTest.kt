package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.category.InMemoryCategorySnapshotStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.MessageSendCoordinator
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.media.MediaBlobFiles
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.preferences.InMemoryPreferenceSnapshotStore
import me.meeshy.sdk.session.AccountClosedException
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.DefaultSessionTeardown
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.io.InputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * #13555 — closing an account while one of its uploads is being queued or sent. Each race is FORCED, never timed: the
 * write is held at a latch (the octets being sealed) or the send at a deferred, the account closes and the next one
 * signs in, then the held step resumes.
 */
@RunWith(RobolectricTestRunner::class)
class OutboxAccountRaceTest {

    @get:Rule val folder = TemporaryFolder()

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private lateinit var directory: File
    private val owner = Owner("A")
    private val fence = AccountFence(owner)
    private val seal = StreamingSeal.ephemeral()
    private lateinit var blobs: MediaBlobStore
    private lateinit var outbox: OutboxRepository
    private lateinit var queue: MediaUploadQueue
    private lateinit var teardown: DefaultSessionTeardown

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        directory = folder.newFolder("media-outbox")
        blobs = MediaBlobStore(db.mediaBlobDao(), MediaBlobFiles(directory) { seal }, Dispatchers.IO, fence)
        outbox = OutboxRepository(db, db.outboxDao(), owner, fence)
        queue = MediaUploadQueue(blobs, outbox)
        teardown = DefaultSessionTeardown(
            db,
            InMemoryCategorySnapshotStore(),
            InMemoryConversationDraftStore(),
            InMemoryConversationLockStore(),
            InMemoryStoryComposerDraftStore(),
            FriendshipCache(),
            NotificationRepository(mockk(relaxed = true)),
            BlockCache(),
            InMemoryPreferenceSnapshotStore(),
            setOf(blobs),
            null,
            fence,
        )
    }

    @After
    fun tearDown() {
        db.close()
    }

    /** A media whose octets are read only once [release] opens — the seal is held mid-write while the account changes. */
    private class HeldSource(private val bytes: ByteArray) : MediaUploadSource {
        val reading = CountDownLatch(1)
        val release = CountDownLatch(1)
        override val size: Long = bytes.size.toLong()
        override fun open(offset: Long): InputStream {
            reading.countDown()
            check(release.await(10, TimeUnit.SECONDS))
            return bytes.inputStream().also { it.skip(offset) }
        }
    }

    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        teardown.wipe()
        owner.id = "B"
    }

    private fun sentAs(sent: MutableList<String?>) = OutboxDrainer(
        outbox = outbox,
        senders = mapOf(OutboxKind.UPLOAD_MEDIA to MutationSender { sent += owner.id; SendResult.SuccessWithId("media-1") }),
        fence = fence,
    )

    @Test
    fun `an upload queued while its account closes is never sent under the next account`(): Unit = runBlocking {
        val held = HeldSource(ByteArray(10_000) { 7 })
        val enqueue = async(Dispatchers.IO) { runCatching { queue.enqueue(MediaUploadItem(held, "photo.jpg", "image/jpeg")) } }
        check(held.reading.await(10, TimeUnit.SECONDS))

        signOutThenSignInAsB()
        held.release.countDown()
        val outcome = withTimeout(10_000) { enqueue.await() }

        assertThat(outcome.exceptionOrNull()).isInstanceOf(AccountClosedException::class.java)
        assertThat(outbox.observeAll().first()).isEmpty()
        assertThat(db.mediaBlobDao().cmids()).isEmpty()
        assertThat(directory.listFiles()!!).isEmpty()
        val sent = mutableListOf<String?>()
        sentAs(sent).drainLane(OutboxLanes.MEDIA)
        assertThat(sent).isEmpty()
    }

    @Test
    fun `a blob sealed after the wipe leaves the disk and keeps no row`(): Unit = runBlocking {
        val held = HeldSource(ByteArray(10_000) { 3 })
        val put = async(Dispatchers.IO) { runCatching { blobs.put("cmid_1", MediaUploadItem(held, "clip.mp4", "video/mp4")) } }
        check(held.reading.await(10, TimeUnit.SECONDS))

        signOutThenSignInAsB()
        held.release.countDown()
        val outcome = withTimeout(10_000) { put.await() }

        assertThat(outcome.exceptionOrNull()).isInstanceOf(AccountClosedException::class.java)
        assertThat(db.mediaBlobDao().cmids()).isEmpty()
        assertThat(directory.listFiles()!!).isEmpty()
    }

    @Test
    fun `a send in flight when its account closes is cancelled before the wipe and never resumes as the next account`(): Unit = runBlocking {
        queue.enqueue(MediaUploadItem(ByteArray(100) { 1 }, "photo.jpg", "image/jpeg"))
        val started = CompletableDeferred<Unit>()
        val resume = CompletableDeferred<Unit>()
        val sent = mutableListOf<String?>()
        val drainer = OutboxDrainer(
            outbox = outbox,
            senders = mapOf(
                OutboxKind.UPLOAD_MEDIA to MutationSender {
                    started.complete(Unit)
                    resume.await()
                    sent += owner.id
                    SendResult.SuccessWithId("media-1")
                },
            ),
            fence = fence,
        )
        val draining = async(Dispatchers.IO) { drainer.drainLane(OutboxLanes.MEDIA) }
        withTimeout(10_000) { started.await() }

        withTimeout(10_000) { signOutThenSignInAsB() }
        resume.complete(Unit)
        withTimeout(10_000) { draining.await() }

        assertThat(sent).isEmpty()
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    /**
     * The message's account is the one signed in when the author SENT it, not when its row is written: the clock read
     * that opens the send is the moment the account closes and B signs in (forced, never timed).
     */
    @Test
    fun `a message sent by A whose account closes before it is queued leaves neither bubble nor row, and never leaves as B`(): Unit = runBlocking {
        val closesOnFirstRead = object : CacheClock {
            var closed = false
            override fun nowMillis(): Long {
                if (!closed) {
                    closed = true
                    runBlocking { signOutThenSignInAsB() }
                }
                return 1_700_000_000_000L
            }
        }
        val sends = MessageSendCoordinator(db, db.messageDao(), outbox, closesOnFirstRead)

        val outcome = runCatching { sends.sendOptimistic("c1", "rendez-vous à 8 h", "fr", MeeshyUser(id = "A", username = "a")) }

        assertThat(outcome.exceptionOrNull()).isInstanceOf(AccountClosedException::class.java)
        assertThat(outbox.observeAll().first()).isEmpty()
        assertThat(db.messageDao().listForConversation("c1")).isEmpty()
    }

    @Test
    fun `a blob queued by one account does not open for another`(): Unit = runBlocking {
        val cmid = queue.enqueue(MediaUploadItem(ByteArray(5_000) { 9 }, "photo.jpg", "image/jpeg"))

        assertThat(blobs.get(cmid, "A")).isNotNull()
        assertThat(blobs.get(cmid, "B")).isNull()
        assertThat(blobs.get(cmid, null)).isNull()
    }

    @Test
    fun `a row still owned by A waits while B is signed in and leaves when A returns`(): Unit = runBlocking {
        queue.enqueue(MediaUploadItem(ByteArray(100) { 1 }, "photo.jpg", "image/jpeg"))
        val sent = mutableListOf<String?>()

        owner.id = "B"
        sentAs(sent).drainLane(OutboxLanes.MEDIA)
        assertThat(sent).isEmpty()
        owner.id = "A"
        sentAs(sent).drainLane(OutboxLanes.MEDIA)

        assertThat(sent).containsExactly("A")
    }
}
