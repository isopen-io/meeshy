package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.model.UserStateMutation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.UserStateRollbackEvents
import me.meeshy.sdk.outbox.senders.UpdateConversationPrefsHandler
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ConversationRepositoryUserStateTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private val outbox get() = OutboxRepository(db, db.outboxDao())

    private fun repository() = ConversationRepository(
        mockk<ConversationApi>(), db, db.conversationDao(), db.syncMetaDao(), outbox,
    )

    private class CountingScheduler : OutboxFlushScheduler {
        var calls = 0
        override fun schedule() { calls++ }
    }

    private fun broadcast(version: Int, isPinned: Boolean): UserPreferencesConversationUpdatedSocketData =
        MeeshyApi.json.decodeFromString(
            """{"userId":"u1","conversationId":"c1","version":$version,"reset":false,
            "preferences":{"isPinned":$isPinned,"isMuted":false,"mentionsOnly":false,"isArchived":false,"tags":[]}}""",
        )

    private suspend fun seeded(prefs: ApiConversationPreferences = ApiConversationPreferences(), unread: Int = 0): ConversationRepository =
        repository().also { it.remember(ApiConversation(id = "c1", unreadCount = unread, preferences = prefs)) }

    private suspend fun ConversationRepository.prefs() = conversationStream("c1").first()?.resolvedPreferences

    @Test
    fun `pinning updates the row before any network confirmation and queues a snapshot`() = runTest {
        val scheduler = CountingScheduler()
        val repo = seeded()
        val writer = ConversationUserStateWriter(repo, scheduler)

        val write = writer.apply("c1", UserStateMutation.SetPinned(true))

        assertThat(write).isEqualTo(UserStateWrite.Queued)
        assertThat(repo.prefs()?.isPinned).isTrue()
        assertThat(outbox.deliverable(OutboxLanes.CONVERSATION_PREFS)).hasSize(1)
        assertThat(scheduler.calls).isEqualTo(1)
    }

    @Test
    fun `two preference gestures on the same conversation leave one snapshot carrying both`() = runTest {
        val repo = seeded()
        val writer = ConversationUserStateWriter(repo, CountingScheduler())

        writer.apply("c1", UserStateMutation.SetPinned(true))
        writer.apply("c1", UserStateMutation.SetMuted(true))

        val rows = outbox.deliverable(OutboxLanes.CONVERSATION_PREFS)
        assertThat(rows).hasSize(1)
        val payload = MeeshyApi.json.decodeFromString(ConversationPrefsPayload.serializer(), rows.single().payload)
        assertThat(payload.isPinned).isTrue()
        assertThat(payload.isMuted).isTrue()
    }

    @Test
    fun `the oldest pre-gesture state survives coalescing so a rollback restores what the server knew`() = runTest {
        val repo = seeded()
        val writer = ConversationUserStateWriter(repo, CountingScheduler())

        writer.apply("c1", UserStateMutation.SetPinned(true))
        writer.apply("c1", UserStateMutation.SetMuted(true))

        val payload = MeeshyApi.json.decodeFromString(
            ConversationPrefsPayload.serializer(),
            outbox.deliverable(OutboxLanes.CONVERSATION_PREFS).single().payload,
        )
        assertThat(payload.previous?.isPinned).isFalse()
        assertThat(payload.previous?.isMuted).isFalse()
    }

    @Test
    fun `an unchanged state queues nothing`() = runTest {
        val writer = ConversationUserStateWriter(seeded(), CountingScheduler())

        assertThat(writer.apply("c1", UserStateMutation.SetPinned(false))).isEqualTo(UserStateWrite.Unchanged)
        assertThat(outbox.deliverable(OutboxLanes.CONVERSATION_PREFS)).isEmpty()
    }

    @Test
    fun `adding and removing a tag edits the cached set`() = runTest {
        val repo = seeded(ApiConversationPreferences(tags = listOf("a")))
        val writer = ConversationUserStateWriter(repo, CountingScheduler())

        writer.apply("c1", UserStateMutation.AddTag("b"))
        assertThat(repo.prefs()?.tags).containsExactly("a", "b").inOrder()
        writer.apply("c1", UserStateMutation.RemoveTag("a"))
        assertThat(repo.prefs()?.tags).containsExactly("b")
    }

    @Test
    fun `locking is local only and never queued`() = runTest {
        val writer = ConversationUserStateWriter(seeded(), CountingScheduler())

        assertThat(writer.apply("c1", UserStateMutation.SetLocked(true))).isEqualTo(UserStateWrite.LocalOnly)
        assertThat(outbox.deliverable(OutboxLanes.CONVERSATION_PREFS)).isEmpty()
        assertThat(outbox.deliverable(OutboxLanes.READ_RECEIPT)).isEmpty()
    }

    @Test
    fun `marking read zeroes the badge at once and queues the receipt`() = runTest {
        val repo = seeded(unread = 4)
        val writer = ConversationUserStateWriter(repo, CountingScheduler())

        assertThat(writer.apply("c1", UserStateMutation.MarkAsRead)).isEqualTo(UserStateWrite.Queued)
        assertThat(repo.conversationStream("c1").first()?.unreadCount).isEqualTo(0)
        assertThat(outbox.deliverable(OutboxLanes.READ_RECEIPT)).hasSize(1)
    }

    private fun handler(repo: ConversationRepository, events: UserStateRollbackEvents) =
        UpdateConversationPrefsHandler(mockk<ConversationApi>(), MeeshyApi.json, repo, outbox, events)

    @Test
    fun `an abandoned snapshot restores the row and tells the screen`() = runTest {
        val repo = seeded()
        val events = UserStateRollbackEvents()
        val writer = ConversationUserStateWriter(repo, CountingScheduler())
        writer.apply("c1", UserStateMutation.SetPinned(true))
        val row = outbox.deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        outbox.markExhausted(row.cmid, "refused")
        val seen = mutableListOf<String>()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { events.events.collect { seen += it.conversationId } }

        handler(repo, events).onExhausted(row)

        assertThat(repo.prefs()?.isPinned).isFalse()
        assertThat(seen).containsExactly("c1")
        job.cancel()
    }

    @Test
    fun `a newer socket broadcast wins over the obsolete optimistic state on rollback`() = runTest {
        val repo = seeded()
        val events = UserStateRollbackEvents()
        ConversationUserStateWriter(repo, CountingScheduler()).apply("c1", UserStateMutation.SetPinned(true))
        val row = outbox.deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        outbox.markExhausted(row.cmid, "refused")
        repo.applyRemoteConversationPreferences(broadcast(version = 5, isPinned = true))

        handler(repo, events).onExhausted(row)

        assertThat(repo.prefs()?.isPinned).isTrue()
    }

    @Test
    fun `a newer pending snapshot is not undone by an older abandoned one`() = runTest {
        val repo = seeded()
        val writer = ConversationUserStateWriter(repo, CountingScheduler())
        writer.apply("c1", UserStateMutation.SetPinned(true))
        val old = outbox.deliverable(OutboxLanes.CONVERSATION_PREFS).single()
        outbox.markExhausted(old.cmid, "refused")
        writer.apply("c1", UserStateMutation.SetMuted(true))

        handler(repo, UserStateRollbackEvents()).onExhausted(old)

        assertThat(repo.prefs()?.isMuted).isTrue()
        assertThat(repo.prefs()?.isPinned).isTrue()
    }
}
