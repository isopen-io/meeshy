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
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ContactsListViewModelTest {

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

    private fun session(id: String? = "me"): SessionRepository =
        mockk<SessionRepository> { every { currentUserId } returns id }

    private fun user(
        id: String,
        username: String = id,
        displayName: String? = null,
        isOnline: Boolean? = null,
        lastActiveAt: String? = null,
    ) = FriendRequestUser(
        id = id,
        username = username,
        displayName = displayName,
        isOnline = isOnline,
        lastActiveAt = lastActiveAt,
    )

    // Real gateway payloads carry both the id strings and the nested user objects;
    // keep them consistent so the object-based list assembly and the id-based cache
    // hydration agree (as they do in production).
    private fun accepted(id: String, sender: FriendRequestUser? = null, receiver: FriendRequestUser? = null) =
        FriendRequest(
            id = id,
            status = "accepted",
            senderId = sender?.id.orEmpty(),
            receiverId = receiver?.id.orEmpty(),
            sender = sender,
            receiver = receiver,
        )

    private fun viewModel(
        received: List<FriendRequest> = emptyList(),
        sent: List<FriendRequest> = emptyList(),
        cache: FriendshipCache = FriendshipCache(),
        session: SessionRepository = session(),
    ): ContactsListViewModel {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Success(received)
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(sent)
        return ContactsListViewModel(repository, cache, session)
    }

    @Test
    fun `loads accepted friends online-first on init`() = runTest {
        val vm = viewModel(
            received = listOf(
                accepted("r1", sender = user("offline", isOnline = false)),
                accepted("r2", sender = user("online", isOnline = true)),
            ),
        )

        assertThat(vm.state.value.friends.map { it.id }).containsExactly("online", "offline").inOrder()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `excludes the current user from their own friend list`() = runTest {
        val vm = viewModel(
            received = listOf(accepted("r1", sender = user("me"), receiver = user("alice"))),
            session = session("me"),
        )

        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice")
    }

    @Test
    fun `hydrates the friendship cache from the fetched requests`() = runTest {
        val cache = FriendshipCache()
        viewModel(received = listOf(accepted("r1", sender = user("alice"))), cache = cache)

        assertThat(cache.isFriend("alice")).isTrue()
    }

    @Test
    fun `both fetches failing on a cold list surfaces the error`() = runTest {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Failure(ApiError("nope"))

        val vm = ContactsListViewModel(repository, FriendshipCache(), session())

        assertThat(vm.state.value.friends).isEmpty()
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `setFilter narrows the visible friends without touching the roster`() = runTest {
        val vm = viewModel(
            received = listOf(
                accepted("r1", sender = user("online", isOnline = true)),
                accepted("r2", sender = user("offline", isOnline = false)),
            ),
        )

        vm.setFilter(ContactFilter.Online)

        assertThat(vm.state.value.filter).isEqualTo(ContactFilter.Online)
        assertThat(vm.state.value.visibleFriends.map { it.id }).containsExactly("online")
        assertThat(vm.state.value.friends).hasSize(2)
    }

    @Test
    fun `search narrows the visible friends`() = runTest {
        val vm = viewModel(
            received = listOf(
                accepted("r1", sender = user("alice", username = "alice")),
                accepted("r2", sender = user("bob", username = "bobby")),
            ),
        )

        vm.search("bob")

        assertThat(vm.state.value.visibleFriends.map { it.id }).containsExactly("bob")
    }

    @Test
    fun `dismissError clears the error message`() = runTest {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        val vm = ContactsListViewModel(repository, FriendshipCache(), session())

        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a cross-screen unfriend removes the contact locally without refetching`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(
            received = listOf(
                accepted("r1", sender = user("alice")),
                accepted("r2", sender = user("bob")),
            ),
            cache = cache,
        )
        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice", "bob")

        cache.didRemoveFriend("bob")

        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice")
        coVerify(exactly = 1) { repository.receivedRequests(any(), any()) }
    }

    @Test
    fun `a cross-screen new friend the list cannot render triggers exactly one silent refetch`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(received = listOf(accepted("r1", sender = user("alice"))), cache = cache)
        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice")

        cache.didAcceptRequest("bob")

        // bob has no user record in the (unchanged) fetch, so the list stays alice-only,
        // but the addition provoked one—and only one—background refetch.
        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice")
        coVerify(exactly = 2) { repository.receivedRequests(any(), any()) }
    }

    @Test
    fun `showSkeleton is true only on a cold loading state`() {
        assertThat(ContactsListUiState(isLoading = true).showSkeleton).isTrue()
        assertThat(ContactsListUiState(isLoading = true, friends = listOf(user("a"))).showSkeleton).isFalse()
        assertThat(ContactsListUiState(isLoading = false).showSkeleton).isFalse()
    }

    @Test
    fun `isFilteredEmpty distinguishes a narrowed-to-nothing roster from a cold-empty one`() {
        val populated = ContactsListUiState(friends = listOf(user("alice")), query = "zzz")
        assertThat(populated.isFilteredEmpty).isTrue()
        assertThat(populated.isEmpty).isFalse()

        val cold = ContactsListUiState()
        assertThat(cold.isFilteredEmpty).isFalse()
        assertThat(cold.isEmpty).isTrue()
    }
}
