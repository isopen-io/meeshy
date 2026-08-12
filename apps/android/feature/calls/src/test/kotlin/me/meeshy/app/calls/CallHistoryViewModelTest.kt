package me.meeshy.app.calls

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.call.CallHistoryPage
import me.meeshy.sdk.call.CallHistoryRepository
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallHistoryViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val repository: CallHistoryRepository = mockk(relaxed = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun record(callId: String, direction: String = "incoming") = CallRecord(
        callId = callId,
        conversationId = "c-$callId",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = direction,
        isVideo = false,
        startedAt = "2026-07-01T10:00:00Z",
        durationSec = 30,
    )

    private fun streamOf(vararg records: CallRecord, result: (List<CallRecord>) -> CacheResult<List<CallRecord>>) {
        every { repository.historyStream(any(), any()) } returns flowOf(result(records.toList()))
    }

    private fun freshStream(vararg records: CallRecord) =
        streamOf(*records) { CacheResult.Fresh(it, 0L) }

    private fun viewModel() = CallHistoryViewModel(repository)

    @Test
    fun `shows skeleton on cold empty cache`() = runTest {
        every { repository.historyStream(any(), any()) } returns flowOf(CacheResult.Empty)

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.showSkeleton).isTrue()
            assertThat(s.records).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows records on fresh cache without skeleton or syncing`() = runTest {
        freshStream(record("a"), record("b"))

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.records.map { it.callId }).containsExactly("a", "b").inOrder()
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.isSyncing).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `stale cache shows records with the syncing indicator`() = runTest {
        streamOf(record("a")) { CacheResult.Stale(it, 5000L) }

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.records).hasSize(1)
            assertThat(s.isSyncing).isTrue()
            assertThat(s.showSkeleton).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `syncing cache carrying cached rows paints them without a skeleton`() = runTest {
        every { repository.historyStream(any(), any()) } returns
            flowOf(CacheResult.Syncing(listOf(record("a"))))

        val vm = viewModel()
        vm.state.test {
            val s = awaitItem()
            assertThat(s.records).hasSize(1)
            assertThat(s.isSyncing).isTrue()
            assertThat(s.showSkeleton).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `surfaces a sync error and drops the skeleton`() = runTest {
        every { repository.historyStream(any(), captureLambda()) } answers {
            lambda<(Throwable) -> Unit>().captured(RuntimeException("timeout"))
            flowOf(CacheResult.Empty)
        }

        val vm = viewModel()
        vm.state.test {
            skipItems(1)
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(vm.state.value.errorMessage).isEqualTo("timeout")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `missed-only filter narrows to missed calls and toggling off restores all`() = runTest {
        freshStream(record("a", "incoming"), record("b", "missed"), record("c", "outgoing"))

        val vm = viewModel()
        vm.setMissedOnly(true)
        assertThat(vm.state.value.records.map { it.callId }).containsExactly("b")

        vm.setMissedOnly(false)
        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `isFilteredEmpty is true when the missed filter matches nothing`() = runTest {
        freshStream(record("a", "incoming"), record("b", "outgoing"))

        val vm = viewModel()
        vm.setMissedOnly(true)

        val s = vm.state.value
        assertThat(s.records).isEmpty()
        assertThat(s.isFilteredEmpty).isTrue()
        assertThat(s.showSkeleton).isFalse()
    }

    @Test
    fun `loadMore near the tail fetches and appends the next page de-duplicated`() = runTest {
        freshStream(record("a"), record("b"), record("c"))
        coEvery { repository.fetchPage(any(), any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(listOf(record("c"), record("d")), nextCursor = "cur2", hasMore = true))

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        val s = vm.state.value
        assertThat(s.records.map { it.callId }).containsExactly("a", "b", "c", "d").inOrder()
        assertThat(s.hasMore).isTrue()
        assertThat(s.isLoadingMore).isFalse()
        coVerify(exactly = 1) { repository.fetchPage(null, any(), any()) }
    }

    @Test
    fun `loadMore far from the tail is a no-op`() = runTest {
        val records = (1..10).map { record("r$it") }.toTypedArray()
        freshStream(*records)

        val vm = viewModel()
        vm.loadMoreIfNeeded("r1")

        coVerify(exactly = 0) { repository.fetchPage(any(), any(), any()) }
    }

    @Test
    fun `loadMore is inert once no more pages remain`() = runTest {
        freshStream(record("a"), record("b"), record("c"))
        coEvery { repository.fetchPage(any(), any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(listOf(record("d")), nextCursor = null, hasMore = false))

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")
        assertThat(vm.state.value.hasMore).isFalse()

        vm.loadMoreIfNeeded("d")
        coVerify(exactly = 1) { repository.fetchPage(any(), any(), any()) }
    }

    @Test
    fun `loadMore advances the cursor on the following page`() = runTest {
        freshStream(record("a"), record("b"), record("c"))
        coEvery { repository.fetchPage(null, any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(listOf(record("d")), nextCursor = "cur2", hasMore = true))
        coEvery { repository.fetchPage("cur2", any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(listOf(record("e")), nextCursor = null, hasMore = false))

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")
        vm.loadMoreIfNeeded("d")

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b", "c", "d", "e").inOrder()
        coVerify(exactly = 1) { repository.fetchPage("cur2", any(), any()) }
    }

    @Test
    fun `a failed page surfaces the error and clears the loading flag`() = runTest {
        freshStream(record("a"), record("b"), record("c"))
        coEvery { repository.fetchPage(any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(message = "offline"))

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")

        assertThat(vm.state.value.errorMessage).isEqualTo("offline")
        assertThat(vm.state.value.isLoadingMore).isFalse()
    }

    @Test
    fun `loadMore is inert while a page is already loading`() = runTest {
        freshStream(record("a"), record("b"), record("c"))
        val gate = CompletableDeferred<Unit>()
        coEvery { repository.fetchPage(any(), any(), any()) } coAnswers {
            gate.await()
            NetworkResult.Success(CallHistoryPage(listOf(record("d")), nextCursor = null, hasMore = false))
        }

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")
        vm.loadMoreIfNeeded("c")
        gate.complete(Unit)

        coVerify(exactly = 1) { repository.fetchPage(any(), any(), any()) }
    }

    @Test
    fun `refresh delegates to the repository and resets paging`() = runTest {
        freshStream(record("a"), record("b"), record("c"))
        coEvery { repository.fetchPage(any(), any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(listOf(record("d")), nextCursor = "cur2", hasMore = true))

        val vm = viewModel()
        vm.loadMoreIfNeeded("c")
        assertThat(vm.state.value.records.map { it.callId }).contains("d")

        vm.refresh()

        coVerify(exactly = 1) { repository.refresh() }
        // Paged rows are dropped; only the cached stream head remains, hasMore reset.
        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b", "c").inOrder()
        assertThat(vm.state.value.hasMore).isTrue()
        assertThat(vm.state.value.isUserRefreshing).isFalse()
    }

    @Test
    fun `a failed refresh surfaces the error`() = runTest {
        freshStream(record("a"))
        coEvery { repository.refresh() } throws RuntimeException("boom")

        val vm = viewModel()
        vm.refresh()

        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
        assertThat(vm.state.value.isUserRefreshing).isFalse()
    }
}
