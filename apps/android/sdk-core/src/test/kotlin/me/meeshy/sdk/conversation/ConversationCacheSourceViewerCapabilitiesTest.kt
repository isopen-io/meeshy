package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationViewerCapabilities
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #14690 — la capacité servie au lecteur survit au cache Room : une liste rouverte hors ligne ne
 * repropose pas « Rendre obsolète » que la passerelle lui refusait, et une ligne servie sans elle
 * reste sans elle (la règle locale décide).
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceViewerCapabilitiesTest {

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

    private fun source(served: List<ApiConversation>): ConversationCacheSource {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns Response.success(
            ApiResponse(
                success = true,
                data = served,
                pagination = Pagination(total = served.size, offset = 0, limit = 30, hasMore = false),
            ),
        )
        return ConversationCacheSource(
            db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)),
            accountProvider = SyncAccountProvider { "me" },
        )
    }

    @Test
    fun `the served capability is restored from the cache, and an absent one stays absent`() = runTest {
        val refused = ApiConversation(id = "c-demande", type = "direct", viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete = false))
        val legacy = ApiConversation(id = "c-ancien", type = "direct")
        val writer = source(listOf(refused, legacy))
        writer.revalidate()

        val reopened = source(emptyList()).observe().first().orEmpty().associateBy { it.id }

        assertThat(reopened.getValue("c-demande").viewerCapabilities).isEqualTo(ConversationViewerCapabilities(canMakeObsolete = false))
        assertThat(reopened.getValue("c-ancien").viewerCapabilities).isNull()
    }
}
