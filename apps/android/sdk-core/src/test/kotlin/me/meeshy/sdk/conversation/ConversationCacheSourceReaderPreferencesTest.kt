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
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationReorderItem
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #18925 — the rich route serves the reader's `version`, `mentionsOnly`, `orderInCategory` and `clearHistoryBefore` on
 * `userPreferences[0]` (`conversationUserPreferencesSelect`). Android writes the order a drag set on another device
 * (`user:preferences-reordered`, #18915); a rich sweep used to rewrite the row without it and reset that order. The
 * witnesses decode the gateway's own row, and an old one without those keys.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceReaderPreferencesTest {

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

    /** A row of the rich route, as the gateway serialises it — with or without the reader's four fields. */
    private fun served(readerFields: String) = MeeshyApi.json.decodeFromString<ApiConversation>(
        """{"id":"c1","type":"group","title":"Groupe","updatedAt":"2023-11-14T20:00:00.000Z",""" +
            """"userPreferences":[{"isPinned":false,"isMuted":false,"isArchived":false,"categoryId":"cat1","tags":[]$readerFields}]}""",
    )

    private fun page(row: ApiConversation) = Response.success(
        ApiResponse(success = true, data = listOf(row), pagination = Pagination(total = 1, offset = 0, limit = 100, hasMore = false)),
    )

    private fun source(api: ConversationApi) =
        ConversationCacheSource(db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)))

    private suspend fun cachedPreferences() =
        db.conversationDao().find("c1")!!.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }.resolvedPreferences

    @Test
    fun `a rich sweep does not take back to nothing the order a drag set on another device`() = runTest {
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(served(""))
        source(api).revalidate()
        RemoteConversationPreferences(db, db.conversationDao(), null).applyReordered(listOf(ConversationReorderItem("c1", 3)))
        assertThat(cachedPreferences()?.orderInCategory).isEqualTo(3)
        coEvery { api.listConditional(any(), any(), any(), any()) } returns page(
            served(""","mentionsOnly":true,"orderInCategory":3,"version":4,"clearHistoryBefore":"2023-11-01T00:00:00.000Z""""),
        )

        source(api).revalidate()

        val preferences = cachedPreferences()!!
        assertThat(preferences.orderInCategory).isEqualTo(3)
        assertThat(preferences.mentionsOnly).isTrue()
        assertThat(preferences.version).isEqualTo(4)
        assertThat(preferences.clearHistoryBefore).isEqualTo("2023-11-01T00:00:00.000Z")
    }

    /** Backward compatible: a gateway that does not serve them yet still decodes, at the defaults it always had. */
    @Test
    fun `an old row without the reader's four fields still decodes, at the defaults`() {
        val preferences = served("").resolvedPreferences!!

        assertThat(preferences.categoryId).isEqualTo("cat1")
        assertThat(preferences.orderInCategory).isNull()
        assertThat(preferences.mentionsOnly).isFalse()
        assertThat(preferences.version).isEqualTo(0)
        assertThat(preferences.clearHistoryBefore).isNull()
    }
}
