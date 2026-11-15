package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/** Une synchro complète qui ne sert pas encore une conversation créée ici à l'instant ne l'efface pas. */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceRecentlyCreatedTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    private fun api(served: List<ApiConversation>): ConversationApi {
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

    private fun row(id: String) = ConversationEntity(id, "{\"id\":\"$id\"}", 1L, 1L, 0)

    @Test
    fun `a protected conversation absent from a complete sweep survives the prune`() = runTest {
        db.conversationDao().upsertAll(listOf(row("just-created"), row("ghost")))

        ConversationCacheSource(
            db, db.conversationDao(), db.syncMetaDao(), api(listOf(ApiConversation(id = "served"))),
            clock, LocalSearchIndex(SearchIndexDao(db)),
            protectedIds = { setOf("just-created") },
        ).revalidate()

        assertThat(db.conversationDao().allIds()).containsExactly("served", "just-created")
    }
}
