package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ContactsViewModelFeedbackTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: FriendRepository = mockk(relaxed = true)
    private val requestListRepository: FriendRequestListRepository = mockk(relaxed = true)

    private fun received(id: String) = FriendRequest(id = id, senderId = "s-$id", status = "pending")
    private fun sent(id: String) = FriendRequest(id = id, receiverId = "r-$id", status = "pending")

    private fun viewModel(received: List<FriendRequest> = emptyList(), sent: List<FriendRequest> = emptyList()): ContactsViewModel {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Success(received)
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(sent)
        coEvery { requestListRepository.cachedReceived() } returns null
        coEvery { requestListRepository.cachedSent() } returns null
        return ContactsViewModel(repository, requestListRepository, FriendshipCache())
    }

    private fun TestScope.collect(vm: ContactsViewModel): List<ConnectionFeedback> {
        val seen = mutableListOf<ConnectionFeedback>()
        backgroundScope.launch(dispatcher) { vm.feedback.collect { seen += it } }
        return seen
    }

    @Test
    fun `accepting a request toasts the accepted connection`() = runTest {
        val vm = viewModel(received = listOf(received("r1")))
        val seen = collect(vm)
        coEvery { repository.respond("r1", true) } returns NetworkResult.Success(received("r1"))

        vm.acceptRequest("r1")

        assertThat(seen).containsExactly(ConnectionFeedback.ConnectionAccepted)
    }

    @Test
    fun `a failed accept toasts the failure instead of reverting silently`() = runTest {
        val vm = viewModel(received = listOf(received("r1")))
        val seen = collect(vm)
        coEvery { repository.respond("r1", true) } returns NetworkResult.Failure(ApiError("boom"))

        vm.acceptRequest("r1")

        assertThat(seen).containsExactly(ConnectionFeedback.AcceptFailed)
        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `declining toasts the decline, and its failure toasts the failure`() = runTest {
        val vm = viewModel(received = listOf(received("r1"), received("r2")))
        val seen = collect(vm)
        coEvery { repository.respond("r1", false) } returns NetworkResult.Success(received("r1"))
        coEvery { repository.respond("r2", false) } returns NetworkResult.Failure(ApiError("boom"))

        vm.declineRequest("r1")
        vm.declineRequest("r2")

        assertThat(seen).containsExactly(ConnectionFeedback.RequestDeclined, ConnectionFeedback.DeclineFailed).inOrder()
    }

    @Test
    fun `cancelling toasts the cancellation, and its failure toasts the failure`() = runTest {
        val vm = viewModel(sent = listOf(sent("s1"), sent("s2")))
        val seen = collect(vm)
        coEvery { repository.deleteRequest("s1") } returns NetworkResult.Success(Unit)
        coEvery { repository.deleteRequest("s2") } returns NetworkResult.Failure(ApiError("boom"))

        vm.cancelRequest("s1")
        vm.cancelRequest("s2")

        assertThat(seen).containsExactly(ConnectionFeedback.RequestCancelled, ConnectionFeedback.CancelFailed).inOrder()
    }
}
