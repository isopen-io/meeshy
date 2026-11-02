package me.meeshy.sdk.call

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallHistoryApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException
import me.meeshy.core.database.entity.CallHistoryEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.call.CallJournalFilter
import me.meeshy.sdk.model.call.CallJournalQuery
import me.meeshy.sdk.model.call.CallJournalType
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.model.call.CallHistoryClearResult
import me.meeshy.sdk.model.call.CallHistoryHideResult

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

    private val clock = object : CacheClock {
        override fun nowMillis(): Long = NOW
    }

    private fun repository() = repository(api)

    private fun repository(api: CallHistoryApi) =
        CallHistoryRepository(api, db, db.callHistoryDao(), db.syncMetaDao(), clock)

    private suspend fun seed(ids: List<String>, startedAt: (Int) -> Long) {
        db.callHistoryDao().upsertAll(
            ids.mapIndexed { i, id ->
                CallHistoryEntity(
                    callId = id,
                    payload = MeeshyApi.json.encodeToString(record(id)),
                    startedAt = startedAt(i),
                    cachedAt = NOW,
                )
            },
        )
    }

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

    @Test
    fun `refresh costs ONE request and keeps the cached tail older than the fresh page`() = runTest {
        val older = (0 until 245).map { "old$it" }
        seed(older) { OLDEST + it * 1_000L }
        val paged = PagedCallHistoryApi(totalCalls = 120)
        val repo = repository(paged)

        repo.refresh()

        assertThat(paged.requests).isEqualTo(1)
        val cached = db.callHistoryDao().observeAll().first().map { it.callId }.toSet()
        assertThat(cached).containsAtLeastElementsIn(older)
        assertThat(cached).containsAtLeastElementsIn((0 until 50).map { "c$it" })
        assertThat(cached).doesNotContain("c50")
    }

    @Test
    fun `refresh deletes a fresh-window line the server no longer lists`() = runTest {
        seed(listOf("gone")) { FRESH + 5 }
        coEvery { api.history(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(record("c1")),
            pagination = Pagination(hasMore = true, nextCursor = "c1"),
        )

        repository().refresh()

        assertThat(db.callHistoryDao().observeAll().first().map { it.callId }).containsExactly("c1")
    }

    @Test
    fun `refresh drops lines past the 90 day window and caps the journal at 1500`() = runTest {
        seed(listOf("ancient")) { NOW - 91L * 24 * 3600 * 1000 }
        seed((0 until 1_600).map { "t$it" }) { OLDEST + it * 1_000L }
        coEvery { api.history(any(), any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(record("c1")),
            pagination = Pagination(hasMore = true, nextCursor = "c1"),
        )

        repository().refresh()

        val ids = db.callHistoryDao().observeAll().first().map { it.callId }
        assertThat(ids).doesNotContain("ancient")
        assertThat(ids.size).isEqualTo(1_500)
        assertThat(ids).contains("c1")
    }

    @Test
    fun `refresh prunes nothing when the envelope omits pagination`() = runTest {
        seed((0 until 5).map { "c$it" }) { FRESH + it }
        val repo = repository(PaginationlessCallHistoryApi(served = listOf(record("new1"))))

        repo.refresh()

        val cachedIds = db.callHistoryDao().observeAll().first().map { it.callId }.toSet()
        assertThat(cachedIds).containsExactlyElementsIn((0 until 5).map { "c$it" } + "new1")
    }

    @Test
    fun `a non-default query is derived from the default cache before the network answers`() = runTest {
        stubHistory(
            record("a", name = "Zoé", video = true),
            record("b", name = "Marc"),
        )
        val repo = repository()
        repo.refresh()
        coEvery { api.history(any(), any(), any(), any(), any()) } returns
            ApiResponse(success = false, error = "offline")

        val emissions = repo.journalStream(
            CallJournalQuery(type = CallJournalType.VIDEO, search = "zoe"),
            fallbackName = "?",
        ).toList()

        assertThat(emissions).hasSize(1)
        assertThat((emissions.single() as CacheResult.Stale).value.map { it.callId }).containsExactly("a")
    }

    @Test
    fun `a non-default query sends its filters once and is then remembered in memory`() = runTest {
        coEvery { api.history(any(), any(), any(), any(), any()) } returns
            ApiResponse(success = true, data = listOf(record("m1")), pagination = Pagination(hasMore = false))
        val repo = repository()
        val query = CallJournalQuery(CallJournalFilter.MISSED, CallJournalType.AUDIO, "Zoé")

        val first = repo.journalStream(query, "?").toList()
        assertThat(first.last()).isInstanceOf(CacheResult.Fresh::class.java)
        coVerify { api.history(null, 50, "missed", "audio", "zoe") }

        coEvery { api.history(any(), any(), any(), any(), any()) } returns
            ApiResponse(success = false, error = "offline")
        val again = repo.journalStream(query, "?").toList()

        assertThat((again.first() as CacheResult.Stale).value.map { it.callId }).containsExactly("m1")
    }

    @Test
    fun `the memory cache is bounded and evicts the least recently used query`() = runTest {
        coEvery { api.history(any(), any(), any(), any(), any()) } returns
            ApiResponse(success = true, data = listOf(record("m1")), pagination = Pagination(hasMore = false))
        val repo = repository()
        (0 until CallJournalMemoryCache.DEFAULT_MAX_ENTRIES + 1).forEach { i ->
            repo.journalStream(CallJournalQuery(search = "q$i"), "?").toList()
        }
        coEvery { api.history(any(), any(), any(), any(), any()) } returns
            ApiResponse(success = false, error = "offline")

        val evicted = repo.journalStream(CallJournalQuery(search = "q0"), "?").toList()

        assertThat(evicted.first()).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `hide removes the line at once and keeps it gone on the next revalidation`() = runTest {
        stubHistory(record("a", "2026-06-20T10:00:00Z"), record("b", "2026-06-19T10:00:00Z"))
        coEvery { api.hide("a") } returns ApiResponse(success = true, data = CallHistoryHideResult("a", true))
        val repo = repository()
        repo.refresh()

        val result = repo.hide("a")
        stubHistory(record("b", "2026-06-19T10:00:00Z"))
        repo.refresh()

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(db.callHistoryDao().observeAll().first().map { it.callId }).containsExactly("b")
    }

    @Test
    fun `hide rolls the line back to its original position when the API fails`() = runTest {
        stubHistory(
            record("a", "2026-06-20T10:00:00Z"),
            record("b", "2026-06-19T10:00:00Z"),
            record("c", "2026-06-18T10:00:00Z"),
        )
        coEvery { api.hide("b") } returns ApiResponse(success = false, error = "nope")
        val repo = repository()
        repo.refresh()

        val result = repo.hide("b")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(db.callHistoryDao().observeAll().first().map { it.callId })
            .containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `a revalidation during a failed hide does not lose the line`() = runTest {
        stubHistory(record("a"))
        coEvery { api.hide("a") } throws IOException("offline")
        val repo = repository()
        repo.refresh()

        val result = repo.hide("a")
        repo.refresh()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(db.callHistoryDao().observeAll().first().map { it.callId }).containsExactly("a")
    }

    @Test
    fun `clearAll empties the journal and reports the count`() = runTest {
        stubHistory(record("a"), record("b"))
        coEvery { api.clearAll() } returns ApiResponse(success = true, data = CallHistoryClearResult(2))
        val repo = repository()
        repo.refresh()

        val result = repo.clearAll()

        assertThat((result as NetworkResult.Success).data).isEqualTo(2)
        assertThat(db.callHistoryDao().observeAll().first()).isEmpty()
    }

    @Test
    fun `clearAll restores every line when the API fails`() = runTest {
        stubHistory(record("a", "2026-06-20T10:00:00Z"), record("b", "2026-06-19T10:00:00Z"))
        coEvery { api.clearAll() } returns ApiResponse(success = false, error = "nope")
        val repo = repository()
        repo.refresh()

        val result = repo.clearAll()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(db.callHistoryDao().observeAll().first().map { it.callId }).containsExactly("a", "b").inOrder()
    }

    private companion object {
        val NOW: Long = java.time.Instant.parse("2026-06-21T00:00:00Z").toEpochMilli()
        val FRESH: Long = java.time.Instant.parse("2026-06-20T10:00:00Z").toEpochMilli()
        val OLDEST: Long = java.time.Instant.parse("2026-06-01T00:00:00Z").toEpochMilli()
    }
}

/**
 * Mirrors the gateway's cursor-paginated `GET /calls/history`: cursor-driven
 * paging + `hasMore`. Counts its requests (the revalidation costs exactly one).
 */
private class PagedCallHistoryApi(totalCalls: Int) : CallHistoryApi {
    private val all: List<CallRecord> = (0 until totalCalls).map { record("c$it") }
    var requests = 0

    override suspend fun history(
        cursor: String?,
        limit: Int?,
        filter: String?,
        type: String?,
        q: String?,
    ): ApiResponse<List<CallRecord>> {
        requests += 1
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

    override suspend fun hide(callId: String): ApiResponse<CallHistoryHideResult> = error("unused")

    override suspend fun clearAll(): ApiResponse<CallHistoryClearResult> = error("unused")
}

/** A single page with NO `pagination` block at all — UNKNOWN completeness, never prune. */
private class PaginationlessCallHistoryApi(private val served: List<CallRecord>) : CallHistoryApi {
    override suspend fun history(
        cursor: String?,
        limit: Int?,
        filter: String?,
        type: String?,
        q: String?,
    ): ApiResponse<List<CallRecord>> = ApiResponse(success = true, data = served, pagination = null)

    override suspend fun hide(callId: String): ApiResponse<CallHistoryHideResult> = error("unused")

    override suspend fun clearAll(): ApiResponse<CallHistoryClearResult> = error("unused")
}

private fun record(
    id: String,
    startedAt: String = "2026-06-20T10:00:00Z",
    name: String? = null,
    video: Boolean = false,
) =
    CallRecord(
        callId = id,
        conversationId = "conv-$id",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = "incoming",
        isVideo = video,
        startedAt = startedAt,
        durationSec = 0,
        peer = name?.let { CallHistoryPeer(userId = "u-$id", username = it.lowercase(), displayName = it) },
    )
