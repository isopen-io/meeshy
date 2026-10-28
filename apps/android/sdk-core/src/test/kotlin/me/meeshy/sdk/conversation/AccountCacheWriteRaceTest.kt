package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #13558 — a cache write of account A that lands AFTER A's purge never survives into B's session. Each race is FORCED,
 * never timed: the response (or the socket window) is held at a deferred, A signs out (session ended, fence closed,
 * tables wiped) and B signs in, then the held step resumes. The interceptor that drops a response arriving after the
 * session ended is out of the picture here (the API is a fake): what is proven is the write-side boundary itself.
 */
@RunWith(RobolectricTestRunner::class)
class AccountCacheWriteRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    /** The order of `AuthRepository.purgeLocalSession` then a login as B: session ended, fence closed and wiped, B adopted. */
    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
    }

    private fun heldConversationApi(requested: CompletableDeferred<Unit>, release: CompletableDeferred<Unit>): ConversationApi {
        val served = listOf(ApiConversation(id = "conversation-de-A"))
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            requested.complete(Unit)
            release.await()
            Response.success(
                ApiResponse(
                    success = true,
                    data = served,
                    pagination = Pagination(total = 1, offset = 0, limit = 30, hasMore = false),
                ),
            )
        }
        return api
    }

    private fun conversationSource(api: ConversationApi) = ConversationCacheSource(
        db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)), fence = fence,
    )

    @Test
    fun `a conversation list served to A after A signed out never lands in B's cache`(): Unit = runBlocking {
        val requested = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val source = conversationSource(heldConversationApi(requested, release))

        val sweep = async(Dispatchers.IO) { runCatching { source.revalidate() } }
        withTimeout(10_000) { requested.await() }
        signOutThenSignInAsB()
        release.complete(Unit)
        withTimeout(10_000) { sweep.await() }

        assertThat(db.conversationDao().allIds()).isEmpty()
        assertThat(db.syncMetaDao().lastSyncedAt("conversations")).isNull()
    }

    @Test
    fun `a conversation list served while A is still signed in lands`(): Unit = runBlocking {
        val requested = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>().apply { complete(Unit) }

        conversationSource(heldConversationApi(requested, release)).revalidate()

        assertThat(db.conversationDao().allIds()).containsExactly("conversation-de-A")
    }

    @Test
    fun `a conversation remembered by A after A signed out is not kept for B`(): Unit = runBlocking {
        val source = conversationSource(mockk())
        val gesture = fence.ticket()
        signOutThenSignInAsB()

        me.meeshy.sdk.session.withAccountTicket(gesture) { source.remember(ApiConversation(id = "direct-de-A")) }

        assertThat(db.conversationDao().allIds()).isEmpty()
    }

    @Test
    fun `a message page served to A after A signed out never lands in B's cache`(): Unit = runBlocking {
        val requested = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api = mockk<MessageApi>()
        coEvery { api.listConditional(any(), any()) } coAnswers {
            requested.complete(Unit)
            release.await()
            Response.success(ApiResponse(success = true, data = listOf(ApiMessage(id = "m-de-A", conversationId = "c1", content = "secret de A"))))
        }
        val source = MessageCacheSource("c1", db, db.messageDao(), db.syncMetaDao(), api, clock, flowOf(50), fence)

        val sweep = async(Dispatchers.IO) { runCatching { source.revalidate() } }
        withTimeout(10_000) { requested.await() }
        signOutThenSignInAsB()
        release.complete(Unit)
        withTimeout(10_000) { sweep.await() }

        assertThat(db.messageDao().listForConversation("c1")).isEmpty()
    }

    @Test
    fun `an older page served to A after A signed out never lands in B's cache`(): Unit = runBlocking {
        val requested = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api = mockk<MessageApi>()
        coEvery { api.list(any(), any(), any(), any()) } coAnswers {
            requested.complete(Unit)
            release.await()
            ApiResponse(success = true, data = listOf(ApiMessage(id = "old-de-A", conversationId = "c1", content = "ancien")))
        }
        val history = MessageHistoryReader(api, db, db.messageDao(), db.syncMetaDao(), clock, fence)
        MessageIngestPipeline(db).ingest(listOf(ApiMessage(id = "seed", conversationId = "c1", content = "x", createdAt = "2026-01-01T00:00:00Z")), 1L)

        val paging = async(Dispatchers.IO) { runCatching { history.loadOlder("c1") } }
        withTimeout(10_000) { requested.await() }
        signOutThenSignInAsB()
        release.complete(Unit)
        withTimeout(10_000) { paging.await() }

        assertThat(db.messageDao().listForConversation("c1")).isEmpty()
    }

    @Test
    fun `a socket window of A still open when A signs out is dropped, the next account's window lands`(): Unit = runBlocking {
        val received = MutableSharedFlow<ApiMessage>()
        val socket: MessageSocketManager = mockk { every { messageReceived } returns received }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val binding = IncomingMessageIngestBinding(
            socket = socket,
            pipeline = MessageIngestPipeline(db),
            clock = clock,
            signal = ConversationRefreshSignal(),
            scope = scope,
            windowMillis = 300L,
            fence = fence,
        )
        try {
            binding.attach()
            withTimeout(10_000) { received.subscriptionCount.first { it > 0 } }
            received.emit(ApiMessage(id = "socket-de-A", conversationId = "c1", content = "pour A"))
            signOutThenSignInAsB()
            delay(600L)

            assertThat(db.messageDao().listForConversation("c1")).isEmpty()

            received.emit(ApiMessage(id = "socket-de-B", conversationId = "c2", content = "pour B"))
            withTimeout(10_000) { while (db.messageDao().listForConversation("c2").isEmpty()) delay(20L) }
            assertThat(db.messageDao().listForConversation("c1")).isEmpty()
        } finally {
            binding.detach()
            scope.cancel()
        }
    }
}
