package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DiscoverViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val userRepository: UserRepository = mockk(relaxed = true)
    private val friendRepository: FriendRepository = mockk(relaxed = true)

    private fun session(id: String? = "me"): SessionRepository =
        mockk<SessionRepository> { every { currentUserId } returns id }

    private fun result(id: String, username: String = id, isOnline: Boolean? = null) =
        UserSearchResult(id = id, username = username, isOnline = isOnline)

    private fun request(id: String, receiverId: String = "", senderId: String = "") =
        FriendRequest(id = id, status = "pending", senderId = senderId, receiverId = receiverId)

    private fun viewModel(
        cache: FriendshipCache = FriendshipCache(),
        blockCache: BlockCache = BlockCache(),
        session: SessionRepository = session(),
    ): DiscoverViewModel =
        DiscoverViewModel(userRepository, friendRepository, cache, blockCache, session)

    @Test
    fun `a sub-threshold query clears results and never hits the network`() = runTest {
        val vm = viewModel()

        vm.onQueryChanged("a")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.isLoading).isFalse()
        coVerify(exactly = 0) { userRepository.searchUsers(any(), any(), any()) }
    }

    @Test
    fun `a searchable query populates rows with a connect action for strangers`() = runTest {
        coEvery { userRepository.searchUsers("ali", any(), any()) } returns
            NetworkResult.Success(listOf(result("alice"), result("bob")))
        val vm = viewModel()

        vm.onQueryChanged("ali")

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("alice", "bob").inOrder()
        assertThat(vm.state.value.rows.map { it.connect }).containsExactly(ConnectAction.Connect, ConnectAction.Connect)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isNoResults).isFalse()
    }

    @Test
    fun `a blocked user resolves to the Blocked connect action via the shared cache`() = runTest {
        coEvery { userRepository.searchUsers("bob", any(), any()) } returns
            NetworkResult.Success(listOf(result("bob")))
        val blockCache = BlockCache().apply { hydrate(listOf(BlockedUser(id = "bob", username = "bob"))) }
        val vm = viewModel(blockCache = blockCache)

        vm.onQueryChanged("bob")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Blocked)
    }

    @Test
    fun `a search returning nothing surfaces the no-results state`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        val vm = viewModel()

        vm.onQueryChanged("zzz")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.isNoResults).isTrue()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a failed search surfaces the error and clears rows`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()

        vm.onQueryChanged("alice")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
        assertThat(vm.state.value.isNoResults).isFalse()
    }

    @Test
    fun `an existing friend renders as contact, an existing sent request as pending`() = runTest {
        val cache = FriendshipCache()
        cache.hydrate(
            sent = listOf(FriendRequest(id = "s1", status = "pending", receiverId = "bob")),
            received = emptyList(),
        )
        cache.didAcceptRequest("alice")
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice"), result("bob"), result("carol")))
        val vm = viewModel(cache = cache)

        vm.onQueryChanged("query")

        val byId = vm.state.value.rows.associate { it.user.id to it.connect }
        assertThat(byId["alice"]).isEqualTo(ConnectAction.Contact)
        assertThat(byId["bob"]).isEqualTo(ConnectAction.Pending)
        assertThat(byId["carol"]).isEqualTo(ConnectAction.Connect)
    }

    @Test
    fun `the current user's own row is hidden and cannot be connected to`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("me")))
        val vm = viewModel(session = session("me"))

        vm.onQueryChanged("me")
        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Hidden)

        vm.connect("me")
        coVerify(exactly = 0) { friendRepository.sendFriendRequest(any(), any()) }
    }

    @Test
    fun `connect sends a request and flips the row to pending on success`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        coEvery { friendRepository.sendFriendRequest("alice", any()) } returns
            NetworkResult.Success(request(id = "req-1", receiverId = "alice"))
        val cache = FriendshipCache()
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")

        vm.connect("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Pending)
        assertThat(vm.state.value.pendingActionIds).isEmpty()
        assertThat(cache.status("alice").javaClass.simpleName).isEqualTo("PendingSent")
        coVerify(exactly = 1) { friendRepository.sendFriendRequest("alice", any()) }
    }

    @Test
    fun `a failed connect surfaces the error, leaves the row connectable and mints no pending`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        coEvery { friendRepository.sendFriendRequest("alice", any()) } returns
            NetworkResult.Failure(ApiError("nope"))
        val cache = FriendshipCache()
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")

        vm.connect("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Connect)
        assertThat(vm.state.value.errorMessage).isEqualTo("nope")
        assertThat(vm.state.value.pendingActionIds).isEmpty()
        assertThat(cache.isFriend("alice")).isFalse()
    }

    @Test
    fun `connecting to a non-connectable row is inert`() = runTest {
        val cache = FriendshipCache()
        cache.didAcceptRequest("alice")
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")

        vm.connect("alice")

        coVerify(exactly = 0) { friendRepository.sendFriendRequest(any(), any()) }
    }

    @Test
    fun `acceptReceived befriends optimistically and clears the pending marker on success`() = runTest {
        val cache = FriendshipCache()
        cache.didReceiveRequest(senderId = "alice", requestId = "req-7")
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        coEvery { friendRepository.respond("req-7", true) } returns
            NetworkResult.Success(request(id = "req-7", senderId = "alice"))
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Accept("req-7"))

        vm.acceptReceived("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Contact)
        assertThat(cache.isFriend("alice")).isTrue()
        assertThat(vm.state.value.pendingActionIds).isEmpty()
    }

    @Test
    fun `a failed acceptReceived rolls the cache back to the received request`() = runTest {
        val cache = FriendshipCache()
        cache.didReceiveRequest(senderId = "alice", requestId = "req-7")
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        coEvery { friendRepository.respond("req-7", true) } returns NetworkResult.Failure(ApiError("down"))
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")

        vm.acceptReceived("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Accept("req-7"))
        assertThat(cache.isFriend("alice")).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("down")
    }

    @Test
    fun `a cross-screen friendship change re-derives the visible rows`() = runTest {
        val cache = FriendshipCache()
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        val vm = viewModel(cache = cache)
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Connect)

        cache.didAcceptRequest("alice")

        assertThat(vm.state.value.rows.single().connect).isEqualTo(ConnectAction.Contact)
    }

    @Test
    fun `clearing the query after a search empties the rows`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns
            NetworkResult.Success(listOf(result("alice")))
        val vm = viewModel()
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.rows).isNotEmpty()

        vm.onQueryChanged("")

        assertThat(vm.state.value.rows).isEmpty()
        assertThat(vm.state.value.showEmptyPrompt).isTrue()
    }

    @Test
    fun `retry re-runs the search for the current query`() = runTest {
        coEvery { userRepository.searchUsers("alice", any(), any()) } returnsMany listOf(
            NetworkResult.Failure(ApiError("boom")),
            NetworkResult.Success(listOf(result("alice"))),
        )
        val vm = viewModel()
        vm.onQueryChanged("alice")
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")

        vm.retry()

        assertThat(vm.state.value.rows.map { it.user.id }).containsExactly("alice")
        assertThat(vm.state.value.errorMessage).isNull()
        coVerify(exactly = 2) { userRepository.searchUsers("alice", any(), any()) }
    }

    @Test
    fun `retry with a sub-threshold query is inert`() = runTest {
        val vm = viewModel()
        vm.onQueryChanged("a")

        vm.retry()

        coVerify(exactly = 0) { userRepository.searchUsers(any(), any(), any()) }
    }

    @Test
    fun `dismissError clears the error message`() = runTest {
        coEvery { userRepository.searchUsers(any(), any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        val vm = viewModel()
        vm.onQueryChanged("alice")

        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
    }
}
