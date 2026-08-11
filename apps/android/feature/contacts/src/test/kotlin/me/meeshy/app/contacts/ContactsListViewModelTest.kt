package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
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
    private val listRepository: FriendListRepository = mockk(relaxed = true)

    private class FixedClock(private val now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun statusBarCache(vararg entries: Pair<StatusFeedMode, List<StatusEntry>>): StatusBarCache {
        val cache = StatusBarCache(FixedClock())
        entries.forEach { (mode, statuses) -> cache.save(mode, statuses) }
        return cache
    }

    private fun status(userId: String, moodEmoji: String) =
        StatusEntry(id = "status-$userId", userId = userId, moodEmoji = moodEmoji)

    private fun session(id: String? = "me"): SessionRepository =
        mockk<SessionRepository> { every { currentUserId } returns id }

    private val userStatusFlow = MutableSharedFlow<UserStatusEvent>()
    private val presenceSnapshotFlow = MutableSharedFlow<PresenceSnapshotEvent>()

    private fun socketManager(): MessageSocketManager = mockk<MessageSocketManager> {
        every { userStatus } returns userStatusFlow
        every { presenceSnapshot } returns presenceSnapshotFlow
    }

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
        cached: List<FriendRequestUser>? = null,
        statuses: StatusBarCache = statusBarCache(),
        socket: MessageSocketManager = socketManager(),
    ): ContactsListViewModel {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Success(received)
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(sent)
        coEvery { listRepository.cachedSnapshot() } returns cached
        return ContactsListViewModel(repository, listRepository, cache, session, statuses, socket)
    }

    @Test
    fun `a live user status event updates the friend's presence without a full reload`() = runTest {
        val vm = viewModel(received = listOf(accepted("r1", sender = user("alice", isOnline = false))))
        assertThat(vm.state.value.friends.single().isOnline).isFalse()

        userStatusFlow.emit(UserStatusEvent(userId = "alice", isOnline = true, lastActiveAt = "2026-08-11T20:00:00.000Z"))

        assertThat(vm.state.value.friends.single().isOnline).isTrue()
        assertThat(vm.state.value.friends.single().lastActiveAt).isEqualTo("2026-08-11T20:00:00.000Z")
        coVerify(exactly = 1) { repository.receivedRequests(any(), any()) }
    }

    @Test
    fun `a presence snapshot updates matching friends without a full reload`() = runTest {
        val vm = viewModel(received = listOf(accepted("r1", sender = user("alice", isOnline = false))))

        presenceSnapshotFlow.emit(PresenceSnapshotEvent(users = listOf(UserStatusEvent(userId = "alice", isOnline = true))))

        assertThat(vm.state.value.friends.single().isOnline).isTrue()
        coVerify(exactly = 1) { repository.receivedRequests(any(), any()) }
    }

    @Test
    fun `a status event for a user not in the roster is a no-op`() = runTest {
        val vm = viewModel(received = listOf(accepted("r1", sender = user("alice", isOnline = false))))

        userStatusFlow.emit(UserStatusEvent(userId = "ghost", isOnline = true))

        assertThat(vm.state.value.friends.single().isOnline).isFalse()
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
        coEvery { listRepository.cachedSnapshot() } returns null

        val vm = ContactsListViewModel(repository, listRepository, FriendshipCache(), session(), statusBarCache(), socketManager())

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
    fun `filterCounts reflects the roster and shrinks with the search query`() = runTest {
        val vm = viewModel(
            received = listOf(
                accepted("r1", sender = user("online", username = "online", isOnline = true)),
                accepted("r2", sender = user("offline", username = "offline", isOnline = false)),
            ),
        )

        assertThat(vm.state.value.filterCounts.all).isEqualTo(2)
        assertThat(vm.state.value.filterCounts.online).isEqualTo(1)
        assertThat(vm.state.value.filterCounts.offline).isEqualTo(1)

        vm.search("online")

        assertThat(vm.state.value.filterCounts.all).isEqualTo(1)
        assertThat(vm.state.value.filterCounts.online).isEqualTo(1)
        assertThat(vm.state.value.filterCounts.offline).isEqualTo(0)
    }

    @Test
    fun `dismissError clears the error message`() = runTest {
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        coEvery { listRepository.cachedSnapshot() } returns null
        val vm = ContactsListViewModel(repository, listRepository, FriendshipCache(), session(), statusBarCache(), socketManager())

        vm.dismissError()

        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `paints the cached roster instantly before the network answers`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<FriendRequest>>>()
        coEvery { listRepository.cachedSnapshot() } returns listOf(user("cachedFriend"))
        coEvery { repository.receivedRequests(any(), any()) } coAnswers { gate.await() }
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())

        val vm = ContactsListViewModel(repository, listRepository, FriendshipCache(), session(), statusBarCache(), socketManager())

        // The Room cache painted at once; the network fetch is still suspended, so
        // there is no cold spinner while a stale-but-present roster is on screen.
        assertThat(vm.state.value.friends.map { it.id }).containsExactly("cachedFriend")
        assertThat(vm.state.value.isLoading).isFalse()

        gate.complete(NetworkResult.Success(listOf(accepted("r1", sender = user("networkFriend")))))

        assertThat(vm.state.value.friends.map { it.id }).containsExactly("networkFriend")
    }

    @Test
    fun `keeps the cached roster and shows no error when the refresh fails`() = runTest {
        coEvery { listRepository.cachedSnapshot() } returns listOf(user("alice"), user("bob"))
        coEvery { repository.receivedRequests(any(), any()) } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        val vm = ContactsListViewModel(repository, listRepository, FriendshipCache(), session(), statusBarCache(), socketManager())

        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice", "bob").inOrder()
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `a cold empty cache shows the skeleton until the network answers`() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<FriendRequest>>>()
        coEvery { listRepository.cachedSnapshot() } returns null
        coEvery { repository.receivedRequests(any(), any()) } coAnswers { gate.await() }
        coEvery { repository.sentRequests(any(), any()) } returns NetworkResult.Success(emptyList())

        val vm = ContactsListViewModel(repository, listRepository, FriendshipCache(), session(), statusBarCache(), socketManager())

        assertThat(vm.state.value.friends).isEmpty()
        assertThat(vm.state.value.showSkeleton).isTrue()

        gate.complete(NetworkResult.Success(emptyList()))

        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun `persists the assembled roster after a successful load`() = runTest {
        viewModel(
            received = listOf(
                accepted("r1", sender = user("online", isOnline = true)),
                accepted("r2", sender = user("offline", isOnline = false)),
            ),
        )

        coVerify {
            listRepository.persist(match { it.map(FriendRequestUser::id) == listOf("online", "offline") })
        }
    }

    @Test
    fun `a cross-screen unfriend writes the pruned roster through to the cache without a refetch`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(
            received = listOf(
                accepted("r1", sender = user("alice")),
                accepted("r2", sender = user("bob")),
            ),
            cache = cache,
        )

        cache.didRemoveFriend("bob")

        assertThat(vm.state.value.friends.map { it.id }).containsExactly("alice")
        coVerify { listRepository.persist(match { it.map(FriendRequestUser::id) == listOf("alice") }) }
        coVerify(exactly = 1) { repository.receivedRequests(any(), any()) }
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

    // --- mood-emoji presence (parity §J "Contacts list ... + mood-emoji") -------

    @Test
    fun `moodEmojiFor resolves the live mood emoji from moodStatuses`() {
        val state = ContactsListUiState(
            moodStatuses = listOf(status("alice", "🔥"), status("bob", "")),
        )

        assertThat(state.moodEmojiFor("alice")).isEqualTo("🔥")
        assertThat(state.moodEmojiFor("bob")).isNull() // blank moodEmoji never surfaces
        assertThat(state.moodEmojiFor("nobody")).isNull()
    }

    @Test
    fun `a friend with a live status paints its mood emoji from the shared FRIENDS status cache`() = runTest {
        val vm = viewModel(
            received = listOf(accepted("r1", sender = user("alice"))),
            statuses = statusBarCache(StatusFeedMode.FRIENDS to listOf(status("alice", "🔥"))),
        )

        assertThat(vm.state.value.moodEmojiFor("alice")).isEqualTo("🔥")
    }

    @Test
    fun `a friend with no live status has no mood emoji`() = runTest {
        val vm = viewModel(received = listOf(accepted("r1", sender = user("alice"))))

        assertThat(vm.state.value.moodEmojiFor("alice")).isNull()
    }

    @Test
    fun `the DISCOVER status cache never leaks into a Contacts row's mood emoji`() = runTest {
        val vm = viewModel(
            received = listOf(accepted("r1", sender = user("alice"))),
            statuses = statusBarCache(StatusFeedMode.DISCOVER to listOf(status("alice", "🎉"))),
        )

        assertThat(vm.state.value.moodEmojiFor("alice")).isNull()
    }
}
