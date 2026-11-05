package me.meeshy.sdk.publication

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.media.MediaBlobFiles
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FeedComposerDraftRecoveryTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private lateinit var drafts: InMemoryPostComposerDraftStore
    private lateinit var publications: PublicationOutbox

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        outbox = OutboxRepository(db, db.outboxDao(), OutboxOwnerSource { "me" })
        val blobs = MediaBlobStore(db.mediaBlobDao(), MediaBlobFiles(kotlin.io.path.createTempDirectory("blobs").toFile()) { me.meeshy.core.crypto.primitives.StreamingSeal.ephemeral() })
        drafts = InMemoryPostComposerDraftStore()
        publications = PublicationOutbox(
            outbox, MediaUploadQueue(blobs, outbox), drafts, InMemoryStoryComposerDraftStore(),
            MediaUploadProgressLedger(), OutboxOwnerSource { "me" },
        )
    }

    @After
    fun tearDown() = db.close()

    private fun media(id: String, mime: String = "image/jpeg") = UploadedMedia(id, "content://$id", mime, 3L, null, null, null, null)

    private suspend fun stuck(
        request: CreatePostRequest = CreatePostRequest(content = "bloqué", type = "POST", mediaIds = listOf("cmid_a")),
        draft: PostComposerDraftSnapshot = PostComposerDraftSnapshot(text = "bloqué", media = listOf(media("cmid_a"))),
    ): String = publications.enqueuePost(request, draft)

    private suspend fun later(cmid: String) = outbox.row(cmid)!!.createdAt + 120_000L

    @Test
    fun `a stuck post comes back in a blank composer with its media and without a duplicate`() = runTest {
        val cmid = stuck()
        val at = later(cmid)

        val recovered = publications.recoverStuckPost(at)

        assertThat(recovered?.text).isEqualTo("bloqué")
        assertThat(recovered?.media?.map { it.id }).containsExactly("cmid_a")
        assertThat(drafts.loadEditing()).isEqualTo(recovered)
        assertThat(outbox.row(cmid)).isNull()
        assertThat(drafts.parked(cmid)).isNull()
        assertThat(publications.recoverStuckPost(at)).isNull()
    }

    @Test
    fun `it never lands on top of what the author is writing`() = runTest {
        val cmid = stuck()
        drafts.saveEditing(PostComposerDraftSnapshot(text = "en cours"))

        assertThat(publications.recoverStuckPost(later(cmid))).isNull()

        assertThat(drafts.loadEditing()?.text).isEqualTo("en cours")
        assertThat(outbox.row(cmid)).isNotNull()
    }

    @Test
    fun `a row that has not waited a minute yet is left on its way`() = runTest {
        val cmid = stuck()

        assertThat(publications.recoverStuckPost(outbox.row(cmid)!!.createdAt + 5_000L)).isNull()
        assertThat(outbox.row(cmid)).isNotNull()
    }

    @Test
    fun `a post that carried media stays a post and a reel is left to the composer`() = runTest {
        val post = stuck(CreatePostRequest(content = "p", type = "POST"), PostComposerDraftSnapshot(text = "p", media = listOf(media("m1"), media("m2"))))
        assertThat(publications.recoverStuckPost(later(post))?.forcePlainPost).isTrue()
        drafts.clearEditing()

        val reel = stuck(CreatePostRequest(content = "r", type = "REEL"), PostComposerDraftSnapshot(text = "r", media = listOf(media("m1"))))
        assertThat(publications.recoverStuckPost(later(reel))?.forcePlainPost).isFalse()
    }

    @Test
    fun `a stuck voice is not taken back`() = runTest {
        val cmid = stuck(draft = PostComposerDraftSnapshot(media = listOf(media("cmid_v", "audio/mp4"))))

        assertThat(publications.recoverStuckPost(later(cmid))).isNull()
        assertThat(outbox.row(cmid)).isNotNull()
    }

    @Test
    fun `the resend after a recovery leaves exactly one row`() = runTest {
        val cmid = stuck()
        val recovered = publications.recoverStuckPost(later(cmid))!!

        val resent = publications.enqueuePost(CreatePostRequest(content = recovered.text, type = "POST"), recovered)

        assertThat(outbox.row(cmid)).isNull()
        assertThat(outbox.row(resent)).isNotNull()
        assertThat(publications.unsent().first()).hasSize(1)
    }
}
