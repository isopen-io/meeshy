package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.FriendshipPages
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationCountsSocketEvent
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChromeViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val sessionRepository: SessionRepository = mockk(relaxed = true)
    private val notificationRepository: NotificationRepository = mockk(relaxed = true)
    private val friendRepository: FriendRepository = mockk(relaxed = true)
    private val notificationCounts = MutableSharedFlow<NotificationCountsSocketEvent>()
    private val messageSocketManager: MessageSocketManager = mockk(relaxed = true) {
        every { notificationCounts } returns this@ChromeViewModelTest.notificationCounts
    }

    private fun viewModel(cache: FriendshipCache = FriendshipCache()): ChromeViewModel {
        coEvery { friendRepository.friendshipGraph(any()) } returns
            NetworkResult.Success(FriendshipPages(sent = emptyList(), received = emptyList()))
        every { notificationRepository.notificationsStream(any(), any()) } returns
            MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        return ChromeViewModel(sessionRepository, notificationRepository, friendRepository, cache, messageSocketManager, me.meeshy.sdk.net.MeeshyConfig())
    }

    @Test
    fun `currentUser passes through SessionRepository currentUser unchanged, including null before restoreSession resolves`() = runTest {
        val userFlow = MutableStateFlow<MeeshyUser?>(null)
        every { sessionRepository.currentUser } returns userFlow
        val vm = viewModel()

        assertThat(vm.currentUser.value).isNull()

        val user = MeeshyUser(id = "u1", username = "alice")
        userFlow.value = user

        assertThat(vm.currentUser.value).isEqualTo(user)
    }

    @Test
    fun `unread notifications pass through the shared NotificationRepository singleton stream unchanged`() = runTest {
        val unreadFlow = MutableStateFlow(0)
        every { notificationRepository.unreadCountStream } returns unreadFlow
        val vm = viewModel()

        assertThat(vm.unreadNotifications.value).isEqualTo(0)

        unreadFlow.value = 7

        assertThat(vm.unreadNotifications.value).isEqualTo(7)
    }

    @Test
    fun `pending friend requests are derived from FriendshipCache pendingReceivedCount and recompute on every cache version bump`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(cache)

        assertThat(vm.pendingFriendRequests.value).isEqualTo(0)

        cache.didReceiveRequest("alice", "r1")

        assertThat(vm.pendingFriendRequests.value).isEqualTo(1)
    }

    @Test
    fun `warm-up is a no-op while unauthenticated`() = runTest {
        val vm = viewModel()

        vm.warmUpIfAuthenticated(false)

        coVerify(exactly = 0) { friendRepository.friendshipGraph(any()) }
        verify(exactly = 0) { notificationRepository.notificationsStream(any(), any()) }
    }

    @Test
    fun `warm-up hydrates FriendshipCache from the friendship graph exactly once, even if warmUpIfAuthenticated(true) is called again`() = runTest {
        val vm = viewModel()

        vm.warmUpIfAuthenticated(true)
        vm.warmUpIfAuthenticated(true)

        coVerify(exactly = 1) { friendRepository.friendshipGraph(any()) }
        verify(exactly = 1) { notificationRepository.notificationsStream(any(), any()) }
    }

    @Test
    fun `warm-up counts an accepted relation the user RECEIVED as a friend`() = runTest {
        every { sessionRepository.currentUserId } returns "me"
        val cache = FriendshipCache()
        val vm = viewModel(cache)
        coEvery { friendRepository.friendshipGraph("me") } returns NetworkResult.Success(
            FriendshipPages(
                sent = emptyList(),
                received = listOf(FriendRequest(id = "in", status = "accepted", senderId = "alice", receiverId = "me")),
            ),
        )

        vm.warmUpIfAuthenticated(true)

        assertThat(cache.isFriend("alice")).isTrue()
    }

    @Test
    fun `a socket notification counts event reaches the repository without any notifications screen ever being open`() = runTest {
        viewModel()

        notificationCounts.emit(NotificationCountsSocketEvent(unread = 5, total = 20))

        verify(exactly = 1) { notificationRepository.applyCounts(5) }
    }

    @Test
    fun `warm-up re-arms after a logout so the next authenticated account re-hydrates`() = runTest {
        val cache = FriendshipCache()
        val vm = viewModel(cache)

        vm.warmUpIfAuthenticated(true)
        cache.clear()
        vm.warmUpIfAuthenticated(false)
        vm.warmUpIfAuthenticated(true)

        coVerify(exactly = 2) { friendRepository.friendshipGraph(any()) }
        verify(exactly = 2) { notificationRepository.notificationsStream(any(), any()) }
    }
}
