package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ContactsViewModelTest {

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

    private fun request(id: String, status: String = "pending") =
        FriendRequest(id = id, status = status)

    private fun viewModel(
        received: List<FriendRequest> = emptyList(),
        sent: List<FriendRequest> = emptyList(),
        cache: FriendshipCache = FriendshipCache(),
        cachedReceived: List<FriendRequest>? = null,
        cachedSent: List<FriendRequest>? = null,
        stubNetwork: Boolean = true,
    ): ContactsViewModel {
        if (stubNetwork) {
            coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Success(received)
            coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(sent)
        }
        coEvery { requestListRepository.cachedReceived() } returns cachedReceived
        coEvery { requestListRepository.cachedSent() } returns cachedSent
        return ContactsViewModel(repository, requestListRepository, cache)
    }

    @Test
    fun `loads received and sent requests on init`() = runTest {
        val vm = viewModel(received = listOf(request("r1")), sent = listOf(request("s1"), request("s2")))

        assertThat(vm.state.value.receivedRequests).hasSize(1)
        assertThat(vm.state.value.sentRequests).hasSize(2)
        assertThat(vm.state.value.isLoadingRequests).isFalse()
    }

    @Test
    fun `default selected tab is Contacts`() = runTest {
        val vm = viewModel()

        assertThat(vm.state.value.selectedTab).isEqualTo(ContactsTab.Contacts)
    }

    @Test
    fun `selectTab updates selected tab`() = runTest {
        val vm = viewModel()

        vm.selectTab(ContactsTab.Requests)

        assertThat(vm.state.value.selectedTab).isEqualTo(ContactsTab.Requests)
    }

    @Test
    fun `acceptRequest removes from received optimistically and responds accepted`() = runTest {
        val vm = viewModel(received = listOf(request("r1"), request("r2")))
        coEvery { repository.respond("r1", true) } returns NetworkResult.Success(request("r1", "accepted"))

        vm.acceptRequest("r1")

        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("r2")
        coVerify { repository.respond("r1", true) }
    }

    @Test
    fun `declineRequest removes from received and responds rejected`() = runTest {
        val vm = viewModel(received = listOf(request("r1")))
        coEvery { repository.respond("r1", false) } returns NetworkResult.Success(request("r1", "rejected"))

        vm.declineRequest("r1")

        assertThat(vm.state.value.receivedRequests).isEmpty()
        coVerify { repository.respond("r1", false) }
    }

    @Test
    fun `cancelRequest removes from sent and deletes request`() = runTest {
        val vm = viewModel(sent = listOf(request("s1"), request("s2")))
        coEvery { repository.deleteRequest("s1") } returns NetworkResult.Success(Unit)

        vm.cancelRequest("s1")

        assertThat(vm.state.value.sentRequests.map { it.id }).containsExactly("s2")
        coVerify { repository.deleteRequest("s1") }
    }

    @Test
    fun `acceptRequest rolls back and surfaces error on failure`() = runTest {
        val vm = viewModel(received = listOf(request("r1")))
        coEvery { repository.respond("r1", true) } returns NetworkResult.Failure(ApiError("Network down"))

        vm.acceptRequest("r1")

        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("r1")
        assertThat(vm.state.value.errorMessage).isEqualTo("Network down")
    }

    @Test
    fun `a successful revalidate clears a prior error even when the cache had already painted non-empty lists`() = runTest {
        val vm = viewModel(received = listOf(request("r1")))
        coEvery { repository.respond("r1", true) } returns NetworkResult.Failure(ApiError("Network down"))
        vm.acceptRequest("r1")
        assertThat(vm.state.value.errorMessage).isEqualTo("Network down")

        vm.loadRequests()

        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `cancelRequest rolls back on failure`() = runTest {
        val vm = viewModel(sent = listOf(request("s1")))
        coEvery { repository.deleteRequest("s1") } returns NetworkResult.Failure(ApiError("boom"))

        vm.cancelRequest("s1")

        assertThat(vm.state.value.sentRequests.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `load hydrates the friendship cache from received and sent requests`() = runTest {
        val cache = FriendshipCache()
        coEvery { repository.receivedRequests(any(), any()) } returns
            NetworkResult.Success(listOf(FriendRequest(id = "r1", senderId = "alice", status = "pending")))
        coEvery { repository.sentRequests(any(), any()) } returns
            NetworkResult.Success(listOf(FriendRequest(id = "s1", receiverId = "bob", status = "accepted")))

        ContactsViewModel(repository, requestListRepository, cache)

        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("r1"))
        assertThat(cache.status("bob")).isEqualTo(FriendshipStatus.Friend)
    }

    @Test
    fun `acceptRequest befriends the sender in the cache`() = runTest {
        val cache = FriendshipCache()
        coEvery { repository.receivedRequests(any(), any()) } returns
            NetworkResult.Success(listOf(FriendRequest(id = "r1", senderId = "alice", status = "pending")))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.respond("r1", true) } returns
            NetworkResult.Success(FriendRequest(id = "r1", senderId = "alice", status = "accepted"))
        val vm = ContactsViewModel(repository, requestListRepository, cache)

        vm.acceptRequest("r1")

        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.Friend)
    }

    @Test
    fun `acceptRequest failure rolls the cache back to pending received`() = runTest {
        val cache = FriendshipCache()
        coEvery { repository.receivedRequests(any(), any()) } returns
            NetworkResult.Success(listOf(FriendRequest(id = "r1", senderId = "alice", status = "pending")))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.respond("r1", true) } returns NetworkResult.Failure(ApiError("nope"))
        val vm = ContactsViewModel(repository, requestListRepository, cache)

        vm.acceptRequest("r1")

        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.PendingReceived("r1"))
    }

    @Test
    fun `declineRequest drops the received pending without befriending`() = runTest {
        val cache = FriendshipCache()
        coEvery { repository.receivedRequests(any(), any()) } returns
            NetworkResult.Success(listOf(FriendRequest(id = "r1", senderId = "alice", status = "pending")))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.respond("r1", false) } returns
            NetworkResult.Success(FriendRequest(id = "r1", senderId = "alice", status = "rejected"))
        val vm = ContactsViewModel(repository, requestListRepository, cache)

        vm.declineRequest("r1")

        assertThat(cache.status("alice")).isEqualTo(FriendshipStatus.None)
        assertThat(cache.isFriend("alice")).isFalse()
    }

    @Test
    fun `cancelRequest clears the sent pending, restoring it on failure`() = runTest {
        val cache = FriendshipCache()
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.sentRequests(any(), any()) } returns
            NetworkResult.Success(listOf(FriendRequest(id = "s1", receiverId = "bob", status = "pending")))
        coEvery { repository.deleteRequest("s1") } returns NetworkResult.Failure(ApiError("offline"))
        val vm = ContactsViewModel(repository, requestListRepository, cache)

        vm.cancelRequest("s1")

        assertThat(cache.status("bob")).isEqualTo(FriendshipStatus.PendingSent("s1"))
    }

    @Test
    fun `surfaces load error`() = runTest {
        coEvery { repository.receivedRequests(any(), any()) } returns
            NetworkResult.Failure(ApiError("Server error", httpStatus = 500))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())

        val vm = ContactsViewModel(repository, requestListRepository)

        assertThat(vm.state.value.errorMessage).isEqualTo("Server error")
        assertThat(vm.state.value.isLoadingRequests).isFalse()
    }

    // --- cache-first (issue #4817) -------------------------------------------

    @Test
    fun `paints the cached received and sent requests instantly before the network answers`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<FriendRequest>>>()
        coEvery { repository.receivedRequests(any(), any()) } coAnswers { gate.await() }
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())

        val vm = viewModel(
            cachedReceived = listOf(request("cachedReceived")),
            cachedSent = listOf(request("cachedSent")),
            stubNetwork = false,
        )

        // The Room cache painted at once; the network fetch is still suspended, so
        // there is no cold spinner while a stale-but-present list is on screen.
        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("cachedReceived")
        assertThat(vm.state.value.sentRequests.map { it.id }).containsExactly("cachedSent")
        assertThat(vm.state.value.isLoadingRequests).isFalse()

        gate.complete(NetworkResult.Success(listOf(request("networkReceived"))))

        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("networkReceived")
    }

    @Test
    fun `a cold empty cache shows the loading spinner until the network answers`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<FriendRequest>>>()
        coEvery { repository.receivedRequests(any(), any()) } coAnswers { gate.await() }
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())

        val vm = viewModel(stubNetwork = false)

        assertThat(vm.state.value.receivedRequests).isEmpty()
        assertThat(vm.state.value.isLoadingRequests).isTrue()

        gate.complete(NetworkResult.Success(emptyList()))

        assertThat(vm.state.value.isLoadingRequests).isFalse()
    }

    @Test
    fun `keeps the cached requests and shows no error when the refresh fails`() = runTest {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        val vm = viewModel(
            cachedReceived = listOf(request("alice"), request("bob")),
            cachedSent = emptyList(),
            stubNetwork = false,
        )

        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("alice", "bob").inOrder()
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoadingRequests).isFalse()
    }

    @Test
    fun `persists the fetched received and sent requests after a successful load`() = runTest {
        viewModel(received = listOf(request("r1")), sent = listOf(request("s1")))

        coVerify {
            requestListRepository.persistReceived(match { it.map(FriendRequest::id) == listOf("r1") })
        }
        coVerify {
            requestListRepository.persistSent(match { it.map(FriendRequest::id) == listOf("s1") })
        }
    }

    @Test
    fun `acceptRequest persists the pruned received roster through to the cache`() = runTest {
        val vm = viewModel(received = listOf(request("r1"), request("r2")))
        coEvery { repository.respond("r1", true) } returns NetworkResult.Success(request("r1", "accepted"))

        vm.acceptRequest("r1")

        assertThat(vm.state.value.receivedRequests.map { it.id }).containsExactly("r2")
        coVerify {
            requestListRepository.persistReceived(match { it.map(FriendRequest::id) == listOf("r2") })
        }
    }

    @Test
    fun `acceptRequest failure re-persists the restored received roster`() = runTest {
        val vm = viewModel(received = listOf(request("r1")))
        coEvery { repository.respond("r1", true) } returns NetworkResult.Failure(ApiError("boom"))

        vm.acceptRequest("r1")

        coVerify {
            requestListRepository.persistReceived(match { it.map(FriendRequest::id) == listOf("r1") })
        }
    }

    @Test
    fun `cancelRequest persists the pruned sent roster through to the cache`() = runTest {
        val vm = viewModel(sent = listOf(request("s1"), request("s2")))
        coEvery { repository.deleteRequest("s1") } returns NetworkResult.Success(Unit)

        vm.cancelRequest("s1")

        assertThat(vm.state.value.sentRequests.map { it.id }).containsExactly("s2")
        coVerify {
            requestListRepository.persistSent(match { it.map(FriendRequest::id) == listOf("s2") })
        }
    }
}
