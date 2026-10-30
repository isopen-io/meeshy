package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.presence.ServedPresencePage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.socket.PresenceMapPersistenceModule
import me.meeshy.sdk.socket.PresenceSources
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.sdk.socket.ServedPresenceSink
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/** La page de conversations sème la carte de présence (#13746), et le cache Room n'en garde rien. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourcePresenceTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    private val served = listOf(
        ApiConversation(
            id = "c1",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "u1", isOnline = true, lastActiveAt = "2026-10-29T10:00:00Z"),
                ApiParticipant(id = "p2", userId = "u2", isOnline = false, lastActiveAt = null),
            ),
        ),
    )

    private var responses = 0L

    private fun api(): ConversationApi {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } answers {
            responses++
            Response.success(
                ApiResponse(
                    success = true,
                    data = served,
                    pagination = Pagination(total = served.size, offset = 0, limit = 30, hasMore = false),
                ),
            )
        }
        return api
    }

    private class RecordingSink : ServedPresenceSink {
        val seeded = mutableListOf<Map<String, UserPresence>>()
        override fun seed(served: Map<String, UserPresence>) {
            seeded += served
        }
    }

    /** Sa marque est le nombre de réponses déjà arrivées : prise à la demande elle vaut 0, à l'arrivée 1. */
    private inner class ReceiptSink : ServedPresenceSink {
        val pages = mutableListOf<ServedPresencePage>()
        override fun seed(served: Map<String, UserPresence>) = Unit
        override fun seedSweep(pages: List<ServedPresencePage>) {
            this.pages += pages
        }
        override fun receipt(): Long = responses
    }

    private fun source(sink: ServedPresenceSink) = ConversationCacheSource(
        db, db.conversationDao(), db.syncMetaDao(), api(), clock, LocalSearchIndex(SearchIndexDao(db)),
        accountProvider = SyncAccountProvider { "me" },
        presenceSink = sink,
    )

    @Test
    fun `a swept page seeds the presence it served`() = runTest {
        val sink = RecordingSink()

        source(sink).revalidate()

        assertThat(sink.seeded).containsExactly(mapOf("u1" to UserPresence(true, "2026-10-29T10:00:00Z")))
    }

    @Test
    fun `the page carries the mark taken when it was asked for and the one taken once its response came back`() = runTest {
        val sink = ReceiptSink()

        source(sink).revalidate()

        assertThat(sink.pages.single().requested).isEqualTo(0L)
        assertThat(sink.pages.single().receipt).isEqualTo(1L)
        assertThat(sink.pages.single().masked).containsExactly("u2")
    }

    private fun participant(userId: String, online: Boolean, last: String?) =
        ApiParticipant(id = "p-$userId", userId = userId, isOnline = online, lastActiveAt = last)

    private class LiveMap(scope: TestScope) {
        val userStatus = MutableSharedFlow<UserStatusEvent>()
        val store = PresenceStore(
            PresenceSources(
                userStatus,
                MutableSharedFlow(),
                MutableSharedFlow(),
                MutableStateFlow(SocketConnectionState.CONNECTED),
                MutableStateFlow("me"),
            ),
            object : CacheClock { override fun nowMillis() = 1_700_000_000_000L },
            { "me" },
            UnconfinedTestDispatcher(scope.testScheduler),
        ).also { it.start() }
        val sink = PresenceMapPersistenceModule.provideServedPresenceSink { store }
        suspend fun heard(userId: String) = userStatus.emit(UserStatusEvent(userId, "c", true, "2026-10-29T10:00:00Z"))
    }

    @Test
    fun `each page answers to its own receipt, so a status heard between page 1 and page 2 is not withdrawn by page 1`() = runTest {
        val live = LiveMap(this)
        live.heard("early")
        live.heard("late")
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            live.heard("early")
            Response.success(
                ApiResponse(
                    success = true,
                    data = listOf(ApiConversation(id = "c1", participants = listOf(participant("early", false, null), participant("late", false, null)))),
                    pagination = Pagination(total = 2, offset = 0, limit = 1, hasMore = true),
                ),
            )
        }
        coEvery { api.list(any(), any(), any()) } coAnswers {
            live.heard("late")
            ApiResponse(
                success = true,
                data = listOf(ApiConversation(id = "c2", participants = listOf(participant("other", true, "2026-10-29T09:00:00Z")))),
                pagination = Pagination(total = 2, offset = 1, limit = 1, hasMore = false),
            )
        }

        ConversationCacheSource(
            db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)),
            accountProvider = SyncAccountProvider { "me" },
            presenceSink = live.sink,
        ).revalidate()

        assertThat(live.store.entriesNow()).doesNotContainKey("early")
        assertThat(live.store.entriesNow()).containsKey("late")
        assertThat(live.store.entriesNow()).containsKey("other")
    }

    @Test
    fun `the cached row keeps the participants but no presence`() = runTest {
        source(RecordingSink()).revalidate()

        val cached = MeeshyApi.json.decodeFromString<ApiConversation>(db.conversationDao().find("c1")!!.payload)
        assertThat(cached.participants.map { it.userId }).containsExactly("u1", "u2")
        assertThat(cached.participants.map { it.isOnline }).containsExactly(null, null)
        assertThat(cached.participants.map { it.lastActiveAt }).containsExactly(null, null)
    }
}
