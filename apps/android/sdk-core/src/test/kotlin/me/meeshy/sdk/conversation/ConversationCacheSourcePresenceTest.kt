package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
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
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.socket.ServedPresenceSink
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/** La page de conversations sème la carte de présence (#13746), et le cache Room n'en garde rien. */
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

    private fun api(): ConversationApi {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } answers {
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
    fun `the cached row keeps the participants but no presence`() = runTest {
        source(RecordingSink()).revalidate()

        val cached = MeeshyApi.json.decodeFromString<ApiConversation>(db.conversationDao().find("c1")!!.payload)
        assertThat(cached.participants.map { it.userId }).containsExactly("u1", "u2")
        assertThat(cached.participants.map { it.isOnline }).containsExactly(null, null)
        assertThat(cached.participants.map { it.lastActiveAt }).containsExactly(null, null)
    }
}
