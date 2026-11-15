package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.call.CallHistoryPage
import me.meeshy.sdk.call.CallHistoryRepository
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallJournalQuery
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Test

/** La recherche du journal : debounce de 250 ms, requête serveur `q`, réponse périmée ignorée. */
@OptIn(ExperimentalCoroutinesApi::class)
class CallHistoryServerSearchTest {

    private val repository: CallHistoryRepository = mockk(relaxed = true)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun record(callId: String, name: String = callId) = CallRecord(
        callId = callId,
        conversationId = "c-$callId",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = "incoming",
        isVideo = false,
        startedAt = "2026-07-01T10:00:00Z",
        durationSec = 30,
        peer = CallHistoryPeer(userId = "u-$callId", username = name, displayName = name),
    )

    private fun TestScope.journal(vararg loaded: CallRecord): CallHistoryViewModel {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        every { repository.historyStream(any(), any()) } returns flowOf(CacheResult.Fresh(loaded.toList(), 0L))
        coEvery { repository.fetchPage(any(), any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(emptyList(), nextCursor = null, hasMore = false))
        return CallHistoryViewModel(repository)
    }

    @Test
    fun `typing asks the server once, 250 ms after the last keystroke`() = runTest {
        val vm = journal(record("a", "Zoé"))
        every { repository.journalStream(any(), any(), any(), any()) } returns flowOf(CacheResult.Fresh(emptyList(), 0L))
        advanceUntilIdle()

        vm.setSearchQuery("z")
        advanceTimeBy(100)
        vm.setSearchQuery("zo")
        advanceTimeBy(249)
        verify(exactly = 0) { repository.journalStream(any(), any(), any(), any()) }

        advanceTimeBy(2)
        verify(exactly = 1) { repository.journalStream(match { it.search == "zo" }, any(), any(), any()) }
    }

    @Test
    fun `lines already loaded that match the typed name stay while the server answers`() = runTest {
        val vm = journal(record("a", "Zoé"), record("b", "Marc"))
        val gate = CompletableDeferred<Unit>()
        every { repository.journalStream(any(), any(), any(), any()) } returns flow {
            gate.await()
            emit(CacheResult.Fresh(listOf(record("old", "Zoé d'avant")), 0L))
        }
        advanceUntilIdle()

        vm.setSearchQuery("zoe")
        advanceTimeBy(300)

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a")
    }

    @Test
    fun `the server answer completes the list with older matches`() = runTest {
        val vm = journal(record("a", "Zoé"))
        every { repository.journalStream(any(), any(), any(), any()) } returns
            flowOf(CacheResult.Fresh(listOf(record("old", "Zoé d'avant"), record("a", "Zoé")), 0L))
        advanceUntilIdle()

        vm.setSearchQuery("zoe")
        advanceTimeBy(300)

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("old", "a")
    }

    @Test
    fun `the answer of an outdated typing is ignored`() = runTest {
        val vm = journal(record("a", "Zoé"))
        val slow = CompletableDeferred<Unit>()
        every { repository.journalStream(match { it.search == "zo" }, any(), any(), any()) } returns flow {
            slow.await()
            emit(CacheResult.Fresh(listOf(record("stale", "Zo stale")), 0L))
        }
        every { repository.journalStream(match { it.search == "zoe" }, any(), any(), any()) } returns
            flowOf(CacheResult.Fresh(listOf(record("a", "Zoé")), 0L))
        advanceUntilIdle()

        vm.setSearchQuery("zo")
        advanceTimeBy(300)
        vm.setSearchQuery("zoe")
        advanceTimeBy(300)
        slow.complete(Unit)
        advanceUntilIdle()

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a")
    }

    @Test
    fun `clearing the search drops the server answer and shows the loaded journal again`() = runTest {
        val vm = journal(record("a", "Zoé"), record("b", "Marc"))
        every { repository.journalStream(any(), any(), any(), any()) } returns
            flowOf(CacheResult.Fresh(listOf(record("a", "Zoé")), 0L))
        advanceUntilIdle()
        vm.setSearchQuery("zoe")
        advanceTimeBy(300)

        vm.setSearchQuery("")
        advanceUntilIdle()

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a failing server search keeps the local matches and raises no error`() = runTest {
        val vm = journal(record("a", "Zoé"))
        every { repository.journalStream(any(), any(), any(), any()) } returns flow { throw IllegalStateException("boom") }
        advanceUntilIdle()

        vm.setSearchQuery("zoe")
        advanceTimeBy(300)

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a")
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `query is a CallJournalQuery of the typed name`() = runTest {
        val vm = journal()
        vm.setSearchQuery("Zoé")
        assertThat(vm.state.value.query).isEqualTo(CallJournalQuery(search = "Zoé"))
    }
}
