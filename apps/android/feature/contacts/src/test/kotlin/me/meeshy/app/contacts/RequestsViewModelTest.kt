package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendConnectionCoordinator
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestListRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.FriendRequestPage
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RequestsViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val friends: FriendRepository = mockk(relaxed = true)
    private val lists: FriendRequestListRepository = mockk(relaxed = true)
    private val coordinator: FriendConnectionCoordinator = mockk(relaxed = true)
    private val notifications: NotificationRepository = mockk(relaxed = true)

    private fun incoming(id: String, status: String = "pending") =
        FriendRequest(id = id, senderId = "from-$id", status = status, sender = FriendRequestUser(id = "from-$id", username = "u-$id"))

    private fun outgoing(id: String) = FriendRequest(id = id, receiverId = "to-$id", status = "pending")

    private fun page(vararg rows: FriendRequest, next: String? = null) =
        NetworkResult.Success(FriendRequestPage(rows.toList(), nextCursor = next, hasMore = next != null))

    private fun viewModel(
        received: NetworkResult<FriendRequestPage> = page(),
        sent: NetworkResult<FriendRequestPage> = page(),
        cachedReceived: List<FriendRequest>? = null,
        cachedSent: List<FriendRequest>? = null,
        cache: FriendshipCache = FriendshipCache(),
        socket: MessageSocketManager? = null,
    ): RequestsViewModel {
        coEvery { friends.pendingRequests(FriendRequestDirection.Received, null, any()) } returns received
        coEvery { friends.pendingRequests(FriendRequestDirection.Sent, null, any()) } returns sent
        coEvery { lists.cachedReceived() } returns cachedReceived
        coEvery { lists.cachedSent() } returns cachedSent
        return RequestsViewModel(friends, lists, coordinator, cache, notifications, BlockCache(), socket)
    }

    @Test
    fun `cached rosters paint first and a failing network keeps them without any error`() = runTest {
        val vm = viewModel(
            received = NetworkResult.Failure(ApiError("offline")),
            sent = NetworkResult.Failure(ApiError("offline")),
            cachedReceived = listOf(incoming("r1")),
            cachedSent = listOf(outgoing("s1")),
        )

        assertThat(vm.state.value.received.rows.map { it.id }).containsExactly("r1")
        assertThat(vm.state.value.sent.rows.map { it.id }).containsExactly("s1")
        assertThat(vm.state.value.received.shownError).isNull()
    }

    @Test
    fun `the skeleton shows only when both directions are cold`() = runTest {
        val hang = CompletableDeferred<NetworkResult<FriendRequestPage>>()
        coEvery { friends.pendingRequests(any(), any(), any()) } coAnswers { hang.await() }
        coEvery { lists.cachedReceived() } returns null
        coEvery { lists.cachedSent() } returns null
        val cold = RequestsViewModel(friends, lists, coordinator, FriendshipCache(), notifications)
        assertThat(cold.state.value.showSkeleton).isTrue()

        coEvery { lists.cachedSent() } returns emptyList()
        val oneSynced = RequestsViewModel(friends, lists, coordinator, FriendshipCache(), notifications)
        assertThat(oneSynced.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `only pending requests are listed and the counters follow the rows`() = runTest {
        val vm = viewModel(
            received = page(incoming("r1"), incoming("r2", "accepted"), incoming("r3")),
            sent = page(outgoing("s1")),
        )

        assertThat(vm.state.value.received.rows.map { it.id }).containsExactly("r1", "r3").inOrder()
        assertThat(vm.state.value.sent.rows).hasSize(1)
    }

    @Test
    fun `a load error is shown only when the direction has no row`() = runTest {
        val empty = viewModel(received = NetworkResult.Failure(ApiError("boom")), sent = page(outgoing("s1")))

        assertThat(empty.state.value.received.shownError).isEqualTo("boom")
        assertThat(empty.state.value.sent.shownError).isNull()
    }

    @Test
    fun `accepting removes the row at once and hands the sender to the outbox coordinator`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(received = page(incoming("r1"), incoming("r2")), cache = cache)

        vm.accept("r1")

        assertThat(vm.state.value.received.rows.map { it.id }).containsExactly("r2")
        verify { coordinator.accept("from-r1", match { it?.id == "from-r1" }) }
        coVerify { lists.persistReceived(match { rows -> rows.map { it.id } == listOf("r2") }, any()) }
    }

    @Test
    fun `an accept the queue gives up on returns the row alone to its place`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(received = page(incoming("r1"), incoming("r2"), incoming("r3")), cache = cache)

        vm.accept("r2")
        cache.didAcceptRequest("from-r2")
        cache.rollbackAccept("from-r2", "r2")

        assertThat(vm.state.value.received.rows.map { it.id }).containsExactly("r1", "r2", "r3").inOrder()
    }

    @Test
    fun `declining goes through reject and a refused decline brings the row back`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(received = page(incoming("r1")), cache = cache)

        vm.decline("r1")
        assertThat(vm.state.value.received.rows).isEmpty()
        verify { coordinator.reject("from-r1") }

        cache.didRejectRequest("from-r1")
        cache.rollbackReject("from-r1", "r1")
        assertThat(vm.state.value.received.rows.map { it.id }).containsExactly("r1")
    }

    @Test
    fun `cancelling a sent request removes it and a failed cancel restores it`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(sent = page(outgoing("s1"), outgoing("s2")), cache = cache)

        vm.cancel("s1")
        assertThat(vm.state.value.sent.rows.map { it.id }).containsExactly("s2")
        verify { coordinator.cancel("to-s1") }

        cache.didCancelRequest("to-s1")
        cache.didSendRequest("to-s1", "s1")
        assertThat(vm.state.value.sent.rows.map { it.id }).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `the next page is read by cursor and never doubles a row`() = runTest {
        val vm = viewModel(received = page(incoming("r1"), incoming("r2"), next = "c1"))
        coEvery { friends.pendingRequests(FriendRequestDirection.Received, "c1", any()) } returns
            page(incoming("r2"), incoming("r3"))

        vm.loadMore(RequestsDirection.Received)

        assertThat(vm.state.value.received.rows.map { it.id }).containsExactly("r1", "r2", "r3").inOrder()
        assertThat(vm.state.value.received.hasMore).isFalse()
        coVerify(exactly = 1) { friends.pendingRequests(FriendRequestDirection.Received, "c1", any()) }
    }

    @Test
    fun `loading more does nothing without a next page`() = runTest {
        val vm = viewModel(received = page(incoming("r1")))

        vm.loadMore(RequestsDirection.Received)

        coVerify(exactly = 2) { friends.pendingRequests(any(), any(), any()) }
    }

    @Test
    fun `pull to refresh forces the network for the visible direction only`() = runTest {
        val vm = viewModel(received = page(incoming("r1")), cachedReceived = listOf(incoming("r1")))
        vm.selectDirection(RequestsDirection.Sent)

        vm.refresh()

        coVerify(exactly = 1) { friends.pendingRequests(FriendRequestDirection.Received, null, any()) }
        coVerify(exactly = 2) { friends.pendingRequests(FriendRequestDirection.Sent, null, any()) }
        assertThat(vm.state.value.isRefreshing).isFalse()
    }

    @Test
    fun `a user update repaints the shown rows without any refetch`() = runTest {
        val updates = MutableSharedFlow<UserUpdatedEvent>(extraBufferCapacity = 4)
        val socket: MessageSocketManager = mockk(relaxed = true)
        every { socket.userUpdated } returns updates
        val vm = viewModel(received = page(incoming("r1")), socket = socket)

        updates.tryEmit(UserUpdatedEvent(userId = "from-r1", username = "renamed", hasNameGroup = true))

        assertThat(vm.state.value.received.rows.single().sender!!.username).isEqualTo("renamed")
        coVerify(exactly = 1) { friends.pendingRequests(FriendRequestDirection.Received, null, any()) }
    }

    @Test
    fun `opening the screen marks the friend request notifications read`() = runTest {
        val vm = viewModel()

        vm.markNotificationsRead()

        coVerify {
            notifications.markTypesAsRead(
                listOf("friend_request", "contact_request", "friend_accepted", "contact_accepted"),
            )
        }
    }
}
