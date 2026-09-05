package me.meeshy.sdk.call

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallHistoryApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class CallHistoryRepositoryTest {

    private val api: CallHistoryApi = mockk(relaxed = true)
    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun repository() =
        CallHistoryRepository(api, db, db.callHistoryDao(), db.syncMetaDao())

    private fun repository(api: CallHistoryApi) =
        CallHistoryRepository(api, db, db.callHistoryDao(), db.syncMetaDao())

    private fun stubHistory(vararg records: CallRecord) {
        coEvery { api.history(any(), any(), any()) } returns
            ApiResponse(success = true, data = records.toList())
    }

    @Test
    fun `historyStream first emission is Empty on a cold cache`() = runTest {
        coEvery { api.history(any(), any(), any()) } returns
            ApiResponse(success = false, error = "down")

        assertThat(repository().historyStream().first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `refresh persists records and sync metadata`() = runTest {
        stubHistory(
            record("c1", "2026-06-20T10:00:00Z"),
            record("c2", "2026-06-21T10:00:00Z"),
        )
        val repo = repository()

        repo.refresh()

        assertThat(db.callHistoryDao().observeAll().first().map { it.callId })
            .containsExactly("c2", "c1").inOrder()
        assertThat(db.syncMetaDao().observe(CallHistoryCacheSource.RESOURCE_KEY).first()).isNotNull()
    }

    @Test
    fun `refresh removes records absent from the latest sync`() = runTest {
        // #5190 — pruning now requires a PROVEN-exhaustive sweep (`pagination.hasMore
        // = false`, explicit); the pre-fix stub's omitted `pagination` (null) reads as
        // UNKNOWN completeness and would no longer prune, so this witness states the
        // envelope explicitly to keep exercising the deletion path under the new
        // semantics — mirrors `ConversationRepositoryTest`'s own #5186 hardening.
        coEvery { api.history(any(), any(), any()) } returnsMany listOf(
            ApiResponse(
                success = true,
                data = listOf(record("c1"), record("c2")),
                pagination = Pagination(hasMore = false),
            ),
            ApiResponse(
                success = true,
                data = listOf(record("c2")),
                pagination = Pagination(hasMore = false),
            ),
        )
        val repo = repository()

        repo.refresh()
        repo.refresh()

        assertThat(db.callHistoryDao().observeAll().first().map { it.callId }).containsExactly("c2")
    }

    @Test
    fun `historyStream serves the cached journal as Fresh after a refresh`() = runTest {
        stubHistory(record("c1"), record("c2"))
        val repo = repository()

        repo.refresh()
        val result = repo.historyStream().first()

        assertThat(result).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat((result as CacheResult.Fresh).value.map { it.callId }).containsExactly("c2", "c1")
    }

    @Test
    fun `refresh throws CallHistorySyncException carrying the API error`() = runTest {
        coEvery { api.history(any(), any(), any()) } returns
            ApiResponse(success = false, error = "Server down")

        val thrown = runCatching { repository().refresh() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(CallHistorySyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("Server down")
    }

    @Test
    fun `fetchPage returns the records with the pagination cursor and hasMore`() = runTest {
        coEvery { api.history(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(record("c1"), record("c2")),
            pagination = Pagination(hasMore = true, nextCursor = "c2"),
        )

        val result = repository().fetchPage()

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val page = (result as NetworkResult.Success).data
        assertThat(page.records.map { it.callId }).containsExactly("c1", "c2").inOrder()
        assertThat(page.nextCursor).isEqualTo("c2")
        assertThat(page.hasMore).isTrue()
    }

    @Test
    fun `fetchPage reports no more pages when pagination is absent`() = runTest {
        stubHistory(record("c1"))

        val page = (repository().fetchPage() as NetworkResult.Success).data

        assertThat(page.nextCursor).isNull()
        assertThat(page.hasMore).isFalse()
    }

    @Test
    fun `fetchPage forwards the cursor limit and the all filter by default`() = runTest {
        stubHistory(record("c1"))

        repository().fetchPage(cursor = "cur-9", limit = 15)

        coVerify { api.history("cur-9", 15, "all") }
    }

    @Test
    fun `fetchPage requests the missed filter when missedOnly`() = runTest {
        stubHistory(record("c1"))

        repository().fetchPage(missedOnly = true)

        coVerify { api.history(any(), any(), "missed") }
    }

    @Test
    fun `fetchPage maps a failed envelope to Failure with its error message`() = runTest {
        coEvery { api.history(any(), any(), any()) } returns
            ApiResponse(success = false, error = "boom", code = "OOPS")

        val result = repository().fetchPage()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.message).isEqualTo("boom")
    }

    @Test
    fun `fetchPage maps a network exception to Failure`() = runTest {
        coEvery { api.history(any(), any(), any()) } throws IOException("offline")

        assertThat(repository().fetchPage()).isInstanceOf(NetworkResult.Failure::class.java)
    }

    /**
     * #5190 — same bug as #5186, on the call journal: the pre-fix `revalidate()`
     * called `callHistoryApi.history(null, HISTORY_PAGE_SIZE=30, null)` for a
     * SINGLE page, then `deleteNotIn`'d against it — any account with more than
     * 30 terminal calls in the 3-month window lost the rest on every
     * revalidation. 245 calls are seeded directly into Room; `refresh()` runs
     * against a server that still serves all 245 — spanning several cursor
     * pages, since [PagedCallHistoryApi] answers `GET /calls/history` exactly
     * like the gateway. None of the 245 should be pruned.
     */
    @Test
    fun `refresh does not drop cached calls that live beyond the first page`() = runTest {
        val total = 245
        db.callHistoryDao().upsertAll(
            (0 until total).map { i ->
                me.meeshy.core.database.entity.CallHistoryEntity(
                    callId = "c$i",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(record("c$i")),
                    startedAt = i.toLong(),
                    cachedAt = i.toLong(),
                )
            },
        )
        val repo = repository(PagedCallHistoryApi(totalCalls = total))

        repo.refresh()

        val cachedIds = db.callHistoryDao().observeAll().first().map { it.callId }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn((0 until total).map { "c$it" })
    }

    /**
     * Same scale proof as `ConversationRepositoryTest`'s #5186 hardening witness
     * (note de revue on #5186's review thread, 2026-09-05): a completed sweep can
     * legitimately be LARGER than SQLite's per-statement bound-variable ceiling
     * (`SQLITE_MAX_VARIABLE_NUMBER` = 999 on Android API 26-29, the floor
     * `minSdk = 26` must hold under) — the 3-month server window bounds the
     * journal for the overwhelming majority of accounts, but does not CAP it. A
     * naive `DELETE ... WHERE callId NOT IN (:keptIds)` binds one variable per
     * kept id and would throw "too many SQL variables" on device at exactly this
     * scale.
     *
     * 1 200 calls are seeded directly into Room; the server sweep (spanning
     * several cursor pages, `hasMore = false` on the last one) serves only the
     * first 1 100 of them — the other 100 genuinely no longer exist. Room does
     * not enforce `SQLITE_MAX_VARIABLE_NUMBER` under Robolectric, so this cannot
     * reproduce the on-device crash directly; what it proves is the delete-set's
     * CORRECTNESS at a scale past the 999 threshold — the chunked `deleteByIds`
     * calls in [CallHistoryCacheSource] are what keep that correct behaviour
     * from crashing where SQLite actually enforces the limit.
     */
    @Test
    fun `refresh purges only the calls truly gone from a 1200-row local cache`() = runTest {
        val localTotal = 1200
        val keptTotal = 1100
        db.callHistoryDao().upsertAll(
            (0 until localTotal).map { i ->
                me.meeshy.core.database.entity.CallHistoryEntity(
                    callId = "c$i",
                    payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(record("c$i")),
                    startedAt = i.toLong(),
                    cachedAt = i.toLong(),
                )
            },
        )
        val repo = repository(PagedCallHistoryApi(totalCalls = keptTotal))

        repo.refresh()

        val cachedIds = db.callHistoryDao().observeAll().first().map { it.callId }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn((0 until keptTotal).map { "c$it" })
    }

    /**
     * #5186-style hardening ported to the call journal: an envelope with NO
     * `pagination` block at all is UNKNOWN completeness, not proven
     * completeness. Reading a missing block as "no more pages, sweep is done"
     * points the failure direction the wrong way for a DELETE. 5
     * previously-synced rows are seeded directly; the fake server answers with a
     * single, different call and NO `pagination` key at all. None of the 5
     * should be pruned — what the page DID mention is still upserted alongside
     * them.
     */
    @Test
    fun `refresh prunes nothing when the envelope omits pagination`() = runTest {
        val existing = (0 until 5).map { i ->
            me.meeshy.core.database.entity.CallHistoryEntity(
                callId = "c$i",
                payload = me.meeshy.sdk.net.MeeshyApi.json.encodeToString(record("c$i")),
                startedAt = i.toLong(),
                cachedAt = i.toLong(),
            )
        }
        db.callHistoryDao().upsertAll(existing)
        val repo = repository(PaginationlessCallHistoryApi(served = listOf(record("new1"))))

        repo.refresh()

        val cachedIds = db.callHistoryDao().observeAll().first().map { it.callId }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn((0 until 5).map { "c$it" } + "new1")
    }
}

/**
 * Mirrors the gateway's cursor-paginated `GET /calls/history`
 * (`services/gateway/src/routes/calls-consultation.ts`,
 * `CallService.listHistory`): cursor-driven paging + `hasMore`, ordered the
 * same way [totalCalls] ids are generated (order itself is irrelevant to the
 * delete-set proof, only exhaustive coverage is). Backs the #5190 regression —
 * a caller that omits pagination (the pre-fix [CallHistoryCacheSource]) only
 * ever sees the first page of [totalCalls].
 */
private class PagedCallHistoryApi(totalCalls: Int) : CallHistoryApi {
    private val all: List<CallRecord> = (0 until totalCalls).map { record("c$it") }

    override suspend fun history(cursor: String?, limit: Int?, filter: String?): ApiResponse<List<CallRecord>> {
        val appliedLimit = limit ?: 30
        val startIndex = cursor?.let { c -> all.indexOfFirst { it.callId == c } + 1 } ?: 0
        val page = all.drop(startIndex).take(appliedLimit)
        val hasMore = startIndex + page.size < all.size
        return ApiResponse(
            success = true,
            data = page,
            pagination = Pagination(hasMore = hasMore, nextCursor = page.lastOrNull()?.callId),
        )
    }
}

/**
 * A single page with NO `pagination` block at all — a legal but degraded
 * envelope shape (`{ success, data }`, no `pagination` key). Backs the #5190
 * hardening: `pagination?.hasMore ?: false` used to read "envelope omitted
 * pagination" the same as "server confirms no more pages", the wrong failure
 * direction for a DELETE — it must read as UNKNOWN completeness (never
 * prune), not proven completeness.
 */
private class PaginationlessCallHistoryApi(private val served: List<CallRecord>) : CallHistoryApi {
    override suspend fun history(cursor: String?, limit: Int?, filter: String?): ApiResponse<List<CallRecord>> =
        ApiResponse(success = true, data = served, pagination = null)
}

private fun record(id: String, startedAt: String = "2026-06-20T10:00:00Z") =
    CallRecord(
        callId = id,
        conversationId = "conv-$id",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = "incoming",
        isVideo = false,
        startedAt = startedAt,
        durationSec = 0,
    )
