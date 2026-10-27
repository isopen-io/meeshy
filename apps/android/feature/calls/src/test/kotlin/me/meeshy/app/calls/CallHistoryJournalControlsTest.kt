package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
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
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Les contrôles du journal d'iOS `CallsTab` : recherche, filtre vidéo, effacement d'une ligne et de tout. */
@OptIn(ExperimentalCoroutinesApi::class)
class CallHistoryJournalControlsTest {

    private val repository: CallHistoryRepository = mockk(relaxed = true)

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun record(callId: String, direction: String = "incoming", isVideo: Boolean = false, name: String = callId) =
        CallRecord(
            callId = callId,
            conversationId = "c-$callId",
            conversationType = "direct",
            mode = "p2p",
            status = "ended",
            direction = direction,
            isVideo = isVideo,
            startedAt = "2026-07-01T10:00:00Z",
            durationSec = 30,
            peer = CallHistoryPeer(userId = "u-$callId", username = name, displayName = name),
        )

    private fun journal(vararg records: CallRecord): CallHistoryViewModel {
        every { repository.historyStream(any(), any()) } returns flowOf(CacheResult.Fresh(records.toList(), 0L))
        coEvery { repository.fetchPage(any(), any(), any()) } returns
            NetworkResult.Success(CallHistoryPage(emptyList(), nextCursor = null, hasMore = false))
        return CallHistoryViewModel(repository)
    }

    @Test
    fun `the video chip keeps only video calls and toggling off restores all`() = runTest {
        val vm = journal(record("a"), record("b", isVideo = true))

        vm.setVideoOnly(true)
        assertThat(vm.state.value.records.map { it.callId }).containsExactly("b")

        vm.setVideoOnly(false)
        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `typing a name narrows the loaded lines at once, accents and case ignored`() = runTest {
        val vm = journal(record("a", name = "Zoé"), record("b", name = "Marc"))

        vm.setSearchQuery("zoe")

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a")
        assertThat(vm.state.value.isSearching).isTrue()
    }

    @Test
    fun `a search with no match on a short journal pages on until the journal is exhausted`() = runTest {
        val vm = journal(record("a", name = "Zoé"))

        vm.setSearchQuery("nobody")

        assertThat(vm.state.value.records).isEmpty()
        coVerify(exactly = 1) { repository.fetchPage(any(), any(), any()) }
    }

    @Test
    fun `hide takes the line off the list at once and asks the gateway`() = runTest {
        coEvery { repository.hide("a") } returns NetworkResult.Success(Unit)
        val vm = journal(record("a"), record("b"))

        vm.hide("a")

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("b")
        assertThat(vm.state.value.eraseFailed).isFalse()
        coVerify(exactly = 1) { repository.hide("a") }
    }

    @Test
    fun `a refused hide brings the line back and raises the failure banner`() = runTest {
        coEvery { repository.hide("a") } returns NetworkResult.Failure(ApiError(message = "boom"))
        val vm = journal(record("a"), record("b"))

        vm.hide("a")

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.eraseFailed).isTrue()

        vm.dismissEraseFailure()
        assertThat(vm.state.value.eraseFailed).isFalse()
    }

    @Test
    fun `clear all empties the journal and a refusal restores every line`() = runTest {
        coEvery { repository.clearAll() } returns NetworkResult.Failure(ApiError(message = "boom"))
        val vm = journal(record("a"), record("b"))

        vm.clearAll()

        assertThat(vm.state.value.records.map { it.callId }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.eraseFailed).isTrue()

        coEvery { repository.clearAll() } returns NetworkResult.Success(2)
        vm.clearAll()

        assertThat(vm.state.value.records).isEmpty()
        assertThat(vm.state.value.eraseFailed).isFalse()
    }

    @Test
    fun `an active search keeps the list footer instead of claiming nothing matches`() {
        val state = CallHistoryUiState(searchQuery = "zo", hasMore = true)
        assertThat(CallHistoryContent.of(state)).isEqualTo(CallHistoryContent.LIST)
        assertThat(CallHistoryContent.of(state.copy(hasMore = false))).isEqualTo(CallHistoryContent.EMPTY)
    }
}
