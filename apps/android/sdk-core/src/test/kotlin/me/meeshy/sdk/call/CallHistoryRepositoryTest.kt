package me.meeshy.sdk.call

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
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
        coEvery { api.history(any(), any(), any()) } returnsMany listOf(
            ApiResponse(success = true, data = listOf(record("c1"), record("c2"))),
            ApiResponse(success = true, data = listOf(record("c2"))),
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
}
