package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.sync.SyncConversationRow
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.sync.SyncAccountProvider
import me.meeshy.sdk.sync.SyncDeltaFetching
import me.meeshy.sdk.sync.SyncDeltaOutcome
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/** #14512 — la synchro par `/sync` ne piétine pas ce qu'elle ne sert pas, et retombe sur `/conversations` sinon. */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceDeltaMergeTest {

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

    private val seeded = ApiConversation(
        id = "c1",
        type = "group",
        title = "Avant",
        lastMessage = ApiConversationLastMessage(id = "m1", content = "Bonjour", createdAt = "2023-11-14T10:00:00.000Z"),
        lastMessageTranslations = mapOf("en" to "Hello"),
        unreadCount = 3,
        currentUserRole = "ADMIN",
        updatedAt = "2023-11-14T10:00:00.000Z",
    )

    private val api = mockk<ConversationApi>().also { api ->
        coEvery { api.listConditional(any(), any(), any(), any()) } returns Response.success(
            ApiResponse(success = true, data = listOf(seeded), pagination = Pagination(total = 1, offset = 0, limit = 100, hasMore = false)),
        )
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = emptyList<ApiConversation>(),
            pagination = Pagination(total = 0, offset = 0, limit = 100, hasMore = false),
        )
    }

    private fun source(sync: SyncDeltaFetching) = ConversationCacheSource(
        db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)),
        accountProvider = SyncAccountProvider { "me" },
        syncDelta = sync,
    )

    private fun row(lastMessageAt: String = "2023-11-14T10:00:00.000Z", id: String = "c1") = SyncConversationRow(
        id = id, type = "group", title = "Apres", isActive = true, updatedAt = "2023-11-14T11:00:00.000Z", lastMessageAt = lastMessageAt,
    )

    private fun delta(vararg rows: SyncConversationRow, complete: Boolean = true, deleted: List<String> = emptyList()) =
        SyncDeltaFetching {
            SyncDeltaOutcome.Delta(
                rows.toList(), deleted, "2023-11-14T09:30:00.000Z", complete = complete, hasGap = false, validator = null,
            )
        }

    private suspend fun cached(id: String = "c1") =
        db.conversationDao().find(id)?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }

    @Test
    fun `l'apercu, les traductions, le non-lu et le role restent apres un delta de sync`() = runTest {
        source(SyncDeltaFetching.None).revalidate()

        source(delta(row())).revalidate()

        val after = cached()!!
        assertThat(after.title).isEqualTo("Apres")
        assertThat(after.lastMessage?.content).isEqualTo("Bonjour")
        assertThat(after.lastMessageTranslations).containsExactly("en", "Hello")
        assertThat(after.unreadCount).isEqualTo(3)
        assertThat(after.currentUserRole).isEqualTo("ADMIN")
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test
    fun `un sync regle le tour sans second appel a la route des conversations`() = runTest {
        source(SyncDeltaFetching.None).revalidate()

        source(delta(row())).revalidate()

        coVerify(exactly = 1) { api.listConditional(any(), any(), any(), any()) }
    }

    @Test
    fun `une activite plus recente que l'apercu garde le merge puis relit la route riche`() = runTest {
        // La route riche sert d'abord la liste, puis un delta VIDE à la relecture : ce qui reste en cache est le merge.
        // Un double qui resservirait la ligne d'origine écraserait le merge par une donnée périmée.
        coEvery { api.listConditional(any(), any(), any(), any()) } returnsMany listOf(
            Response.success(
                ApiResponse(success = true, data = listOf(seeded), pagination = Pagination(total = 1, offset = 0, limit = 100, hasMore = false)),
            ),
            Response.success(
                ApiResponse(
                    success = true,
                    data = emptyList<ApiConversation>(),
                    pagination = Pagination(total = 0, offset = 0, limit = 100, hasMore = false),
                ),
            ),
        )
        source(SyncDeltaFetching.None).revalidate()
        coEvery { api.listConditional(any(), any(), any(), any()) } returns Response.success(
            ApiResponse(success = true, data = emptyList<ApiConversation>(), pagination = Pagination(total = 0, offset = 0, limit = 100, hasMore = false)),
        )

        source(delta(row(lastMessageAt = "2023-11-14T12:00:00.000Z"))).revalidate()

        assertThat(cached()!!.title).isEqualTo("Apres")
        coVerify(exactly = 2) { api.listConditional(any(), any(), any(), any()) }
    }

    @Test
    fun `sync indisponible retombe sur les conversations sans perdre le point de reprise`() = runTest {
        source(SyncDeltaFetching.None).revalidate()
        val before = db.syncMetaDao().watermark(ConversationCacheSource.RESOURCE_KEY)

        source { SyncDeltaOutcome.Unavailable("404") }.revalidate()

        assertThat(before).isNotNull()
        assertThat(db.syncMetaDao().watermark(ConversationCacheSource.RESOURCE_KEY)).isEqualTo(before)
        assertThat(cached()!!.title).isEqualTo("Avant")
    }

    @Test
    fun `un 304 n'ecrit que la fraicheur`() = runTest {
        source(SyncDeltaFetching.None).revalidate()
        val before = db.syncMetaDao().watermark(ConversationCacheSource.RESOURCE_KEY)

        source { SyncDeltaOutcome.NotModified }.revalidate()

        assertThat(db.syncMetaDao().watermark(ConversationCacheSource.RESOURCE_KEY)).isEqualTo(before)
        assertThat(cached()!!.title).isEqualTo("Avant")
    }

    @Test
    fun `une disparition servie retire la conversation du cache`() = runTest {
        source(SyncDeltaFetching.None).revalidate()

        source(delta(deleted = listOf("c1"))).revalidate()

        assertThat(cached()).isNull()
    }
}
