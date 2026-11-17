package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #18926 — a REST sweep read before a `message:new` lands after it: its page never takes the row back to the older message
 * (compare-and-swap, facet by facet), while a preview that went back on the server goes back.
 * #18927 — the list runs one sweep at a time: callers join it, and a catch-up adds exactly one more.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceLiveSweepTest {

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

    private val journal = ConversationLiveJournal()

    private fun group(lastId: String, at: String) = ApiConversation(
        id = "c1",
        type = "group",
        title = "Groupe",
        lastMessage = ApiConversationLastMessage(id = lastId, content = "texte $lastId", createdAt = at),
        updatedAt = at,
    )

    private fun page(vararg rows: ApiConversation) = Response.success(
        ApiResponse(success = true, data = rows.toList(), pagination = Pagination(total = rows.size, offset = 0, limit = 100, hasMore = false)),
    )

    private fun source(api: ConversationApi) = ConversationCacheSource(
        db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)),
        journal = journal,
    )

    private fun patcher() = ConversationLivePatcher(
        database = db,
        conversationDao = db.conversationDao(),
        messageDao = db.messageDao(),
        conversationApi = mockk(relaxed = true),
        session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        },
        readerLabel = object : ReaderLabelProvider {
            override fun youLabel(): String = "Vous"
        },
        journal = journal,
    )

    private suspend fun cached(): ApiConversation? =
        db.conversationDao().find("c1")?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }

    @Test
    fun `a message received while a sweep read before it is in flight keeps the preview and the rank it brought`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m1", T1))
        source(api).revalidate()
        val live = patcher()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            live.applyMessage(ApiMessage(id = "m2", conversationId = "c1", senderId = "u-peer", content = "nouveau", createdAt = T2))
            page(group("m1", T1))
        }

        source(api).revalidate()

        assertThat(cached()!!.lastMessage?.id).isEqualTo("m2")
        assertThat(db.conversationDao().find("c1")!!.updatedAt).isEqualTo(Instant.parse(T2).toEpochMilli())
    }

    /** The boundary: nothing live during the flight — the last message deleted while away takes the preview back. */
    @Test
    fun `a last message deleted while away takes the preview back, the sweep writing what it read`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m1", T1))
        source(api).revalidate()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(group("m0", T0))

        source(api).revalidate()

        assertThat(cached()!!.lastMessage?.id).isEqualTo("m0")
    }

    @Test
    fun `two callers during a sweep share one network read`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            gate.await()
            page(group("m1", T1))
        }
        val src = source(api)

        val first = async { src.revalidate() }
        val second = async { src.revalidate() }
        runCurrent()
        gate.complete(Unit)
        first.await()
        second.await()

        coVerify(exactly = 1) { api.listConditional(any(), any(), any(), any()) }
    }

    @Test
    fun `a catch-up asked during a sweep adds exactly one more sweep`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } coAnswers {
            gate.await()
            page(group("m1", T1))
        }
        val src = source(api)

        val running = async { src.revalidate() }
        runCurrent()
        val catchUps = List(2) { async { src.catchUp() } }
        runCurrent()
        gate.complete(Unit)
        running.await()
        catchUps.forEach { it.await() }

        coVerify(exactly = 2) { api.listConditional(any(), any(), any(), any()) }
    }

    private companion object {
        const val T0 = "2023-11-14T19:00:00.000Z"
        const val T1 = "2023-11-14T20:00:00.000Z"
        const val T2 = "2023-11-14T21:00:00.000Z"
    }
}
