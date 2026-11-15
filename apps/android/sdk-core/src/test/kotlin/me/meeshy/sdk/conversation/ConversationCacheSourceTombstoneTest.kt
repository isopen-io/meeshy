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
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.sync.SyncCheckpointStore
import me.meeshy.sdk.model.sync.SyncCheckpoint
import me.meeshy.sdk.model.sync.ReconcilePlan
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

/** Une conversation fermée, quittée ou supprimée ailleurs disparaît au prochain delta, et son cache de messages avec elle. */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceTombstoneTest {

    private lateinit var db: MeeshyDatabase
    private var now = 1_700_000_000_000L

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private val clock = object : CacheClock {
        override fun nowMillis() = now
    }

    private fun conversation(id: String) = ApiConversation(
        id = id, type = "group", title = "T-$id",
        lastMessage = ApiConversationLastMessage(id = "m-$id", content = "Bonjour", createdAt = "2023-11-14T10:00:00.000Z"),
        updatedAt = "2023-11-14T10:00:00.000Z",
    )

    private val api = mockk<ConversationApi>().also { api ->
        coEvery { api.listConditional(any(), any(), any(), any()) } returns Response.success(
            ApiResponse(
                success = true, data = listOf(conversation("c1"), conversation("c2")),
                pagination = Pagination(total = 2, offset = 0, limit = 100, hasMore = false),
            ),
        )
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(
            success = true, data = emptyList<ApiConversation>(),
            pagination = Pagination(total = 0, offset = 0, limit = 100, hasMore = false),
        )
    }

    private fun source(sync: SyncDeltaFetching) = ConversationCacheSource(
        db, db.conversationDao(), db.syncMetaDao(), api, clock, LocalSearchIndex(SearchIndexDao(db)),
        accountProvider = SyncAccountProvider { "me" },
        syncDelta = sync,
    )

    private fun delta(rows: List<SyncConversationRow>, deleted: List<String>) = SyncDeltaFetching {
        SyncDeltaOutcome.Delta(rows, deleted, "2023-11-14T09:30:00.000Z", complete = true, hasGap = false, validator = null)
    }

    private suspend fun seedMessage(conversationId: String) = db.messageDao().upsertAll(
        listOf(
            MessageEntity(
                id = "msg-$conversationId", conversationId = conversationId, seq = null, payload = "{}",
                createdAt = 1L, cachedAt = 0L, sendState = null, serverId = null,
            ),
        ),
    )

    @Test
    fun `un tombstone retire la conversation au prochain delta et invalide ses messages`() = runTest {
        source(SyncDeltaFetching.None).revalidate()
        seedMessage("c1")
        seedMessage("c2")

        source(delta(rows = emptyList(), deleted = listOf("c1"))).revalidate()

        assertThat(db.conversationDao().find("c1")).isNull()
        assertThat(db.conversationDao().find("c2")).isNotNull()
        assertThat(db.messageDao().find("msg-c1")).isNull()
        assertThat(db.messageDao().find("msg-c2")).isNotNull()
    }

    @Test
    fun `une ligne inactive du delta retire la conversation`() = runTest {
        source(SyncDeltaFetching.None).revalidate()

        val inactive = SyncConversationRow(id = "c2", type = "group", isActive = false)
        source(delta(rows = listOf(inactive), deleted = emptyList())).revalidate()

        assertThat(db.conversationDao().find("c2")).isNull()
        assertThat(db.conversationDao().find("c1")).isNotNull()
    }

    @Test
    fun `a 24 h de la derniere reconciliation le delta cede la place au balayage complet`() = runTest {
        source(SyncDeltaFetching.None).revalidate()
        SyncCheckpointStore(db.syncMetaDao()).write("me", SyncCheckpoint(lastFullReconcile = now - ReconcilePlan.INTERVAL_MILLIS))
        var called = false

        source(SyncDeltaFetching { called = true; SyncDeltaOutcome.Unavailable("x") }).revalidate()

        assertThat(called).isFalse()
    }
}
