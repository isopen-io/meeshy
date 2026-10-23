package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.sync.SyncOwnership
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceParallelTest {

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

    private fun page(all: List<ApiConversation>, offset: Int, limit: Int): ApiResponse<List<ApiConversation>> {
        val rows = all.drop(offset).take(limit)
        return ApiResponse(
            success = true,
            data = rows,
            pagination = Pagination(total = all.size, offset = offset, limit = limit, hasMore = offset + rows.size < all.size),
        )
    }

    private fun api(
        total: Int,
        offsets: MutableList<Int> = mutableListOf(),
        failOffset: Int? = null,
        failures: IntArray = intArrayOf(0),
        beforeReply: suspend (Int) -> Unit = {},
    ): ConversationApi {
        val all = (0 until total).map { ApiConversation(id = "c$it", title = "Conv $it") }
        val api = mockk<ConversationApi>()
        coEvery { api.listConditional(any(), any(), any(), any()) } answers {
            Response.success(page(all, firstArg<Int?>() ?: 0, secondArg<Int?>() ?: 30))
        }
        coEvery { api.list(any(), any(), any()) } coAnswers {
            val offset = firstArg<Int?>() ?: 0
            offsets += offset
            beforeReply(offset)
            if (offset == failOffset && failures[0]-- > 0) throw IOException("page lost")
            page(all, offset, secondArg<Int?>() ?: 30)
        }
        return api
    }

    private fun source(api: ConversationApi, account: SyncAccountProvider = SyncAccountProvider.None) =
        ConversationCacheSource(db, db.conversationDao(), db.syncMetaDao(), api, clock, account)

    @Test
    fun `every page lands and the sweep is proven complete so stale rows are pruned`() = runTest {
        db.conversationDao().upsertAll(
            listOf(me.meeshy.core.database.entity.ConversationEntity("ghost", "{\"id\":\"ghost\"}", 1L, 1L, 0)),
        )
        source(api(total = 450)).revalidate()
        val ids = db.conversationDao().allIds()
        assertThat(ids).hasSize(450)
        assertThat(ids).doesNotContain("ghost")
    }

    @Test
    fun `remaining pages are requested together rather than one after the other`() = runTest {
        var inFlight = 0
        var peak = 0
        val api = api(total = 1000) {
            inFlight += 1
            peak = maxOf(peak, inFlight)
            delay(50)
            inFlight -= 1
        }
        source(api).revalidate()
        assertThat(peak).isEqualTo(4)
        assertThat(db.conversationDao().allIds()).hasSize(1000)
    }

    @Test
    fun `a page that fails once is retried and the sweep still completes`() = runTest {
        source(api(total = 300, failOffset = 100, failures = intArrayOf(1))).revalidate()
        assertThat(db.conversationDao().allIds()).hasSize(300)
    }

    @Test
    fun `a page lost for good keeps what arrived but never prunes`() = runTest {
        db.conversationDao().upsertAll(
            listOf(me.meeshy.core.database.entity.ConversationEntity("keep", "{\"id\":\"keep\"}", 1L, 1L, 0)),
        )
        source(api(total = 300, failOffset = 200, failures = intArrayOf(99))).revalidate()
        val ids = db.conversationDao().allIds()
        assertThat(ids).contains("keep")
        assertThat(ids).contains("c0")
        assertThat(ids).contains("c150")
        assertThat(ids).doesNotContain("c250")
    }

    @Test
    fun `a sweep left by an account switch writes nothing`() = runTest {
        val ownership = SyncOwnership<Unit>()
        val src = ConversationCacheSource(
            db, db.conversationDao(), db.syncMetaDao(),
            api(total = 300) { ownership.claim("bob") },
            clock, SyncAccountProvider { "alice" }, ownership = ownership,
        )
        src.revalidate()
        assertThat(db.conversationDao().allIds()).isEmpty()
        assertThat(db.syncMetaDao().lastSyncedAt("sync-checkpoint:alice:lastSync")).isNull()
    }

    @Test
    fun `each account keeps its own checkpoint`() = runTest {
        var active: String? = "alice"
        val src = source(api(total = 50), SyncAccountProvider { active })
        src.revalidate()
        active = "bob"
        src.revalidate()
        val dao = db.syncMetaDao()
        assertThat(dao.lastSyncedAt("sync-checkpoint:alice:lastSync")).isEqualTo(1_700_000_000_000L)
        assertThat(dao.lastSyncedAt("sync-checkpoint:bob:lastFullReconcile")).isEqualTo(1_700_000_000_000L)
    }
}
