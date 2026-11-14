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
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.InMemoryGameDevicePrefsStore
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.FriendshipPages
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.game.GameActsRing
import me.meeshy.sdk.model.game.GameMission
import me.meeshy.sdk.model.game.GameMissions
import me.meeshy.sdk.model.game.MissionDifficulty
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
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
    private val notificationReceived = MutableSharedFlow<ApiNotification>()
    private val messageSocketManager: MessageSocketManager = mockk(relaxed = true) {
        every { notificationCounts } returns this@ChromeViewModelTest.notificationCounts
        every { notificationReceived } returns this@ChromeViewModelTest.notificationReceived
    }

    private val bell = MutableStateFlow(0)

    private val engagement: EngagementProgressRepository = mockk(relaxed = true)
    private val gamePrefs = InMemoryGameDevicePrefsStore()

    private val coordinator = me.meeshy.sdk.notification.UnreadBadgeCoordinator(
        cacheSnapshots = kotlinx.coroutines.flow.emptyFlow(),
        serverUpdates = kotlinx.coroutines.flow.emptyFlow(),
        localReads = kotlinx.coroutines.flow.emptyFlow(),
        bell = bell,
        badgesEnabled = MutableStateFlow(true),
        openConversation = MutableStateFlow(null),
        sinks = emptySet(),
    )

    @Test
    fun `la pastille suit le total du coordinateur`() = runTest {
        val vm = viewModel()
        assertThat(vm.unreadMessages.value).isEqualTo(0)
        coordinator.start(backgroundScope)
        coordinator.onServerUnread("c1", 3)
        testScheduler.advanceTimeBy(200)
        testScheduler.runCurrent()
        assertThat(vm.unreadMessages.value).isEqualTo(3)
    }

    private fun viewModel(cache: FriendshipCache = FriendshipCache()): ChromeViewModel {
        coEvery { friendRepository.friendshipGraph(any()) } returns
            NetworkResult.Success(FriendshipPages(sent = emptyList(), received = emptyList()))
        every { notificationRepository.notificationsStream(any(), any()) } returns
            MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        return ChromeViewModel(sessionRepository, notificationRepository, friendRepository, cache, messageSocketManager, me.meeshy.sdk.net.MeeshyConfig(), coordinator, engagement, gamePrefs)
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
    fun `la cloche suit l'etat du coordinateur apres son debounce`() = runTest {
        val vm = viewModel()
        coordinator.start(backgroundScope)

        assertThat(vm.unreadNotifications.value).isEqualTo(0)

        bell.value = 7
        testScheduler.advanceTimeBy(200)
        testScheduler.runCurrent()

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

    private fun progressWithActs(vararg done: Boolean): ApiEngagementProgress {
        val items = done.mapIndexed { index, isDone ->
            GameMission(
                id = "m$index", templateKey = "send-messages", difficulty = MissionDifficulty.Easy, signal = "axis:content.post",
                prism = false, target = 5, progress = 2, reward = 600, glory = 60,
                completedAt = if (isDone) "2026-11-14T09:00:00.000Z" else null,
            )
        }
        val missions = GameMissions(dayKey = "2026-11-14", prismDay = false, unlocked = true, items = items, rerollAvailable = false)
        return mockk { every { game } returns mockk { every { this@mockk.missions } returns missions } }
    }

    @Test
    fun `l'anneau des actes du jour se lit dans le cache du jeu, une fois la session ouverte`() = runTest {
        every { engagement.progress(any()) } returns MutableStateFlow(CacheResult.Stale(progressWithActs(true, false, true), 0L))
        val vm = viewModel()

        assertThat(vm.actsRing.value).isNull()
        vm.warmUpIfAuthenticated(true)

        assertThat(vm.actsRing.value).isEqualTo(GameActsRing(done = 2, total = 3))
    }

    @Test
    fun `avant l'authentification, rien n'est lu pour l'anneau`() = runTest {
        val vm = viewModel()

        assertThat(vm.actsRing.value).isNull()
        verify(exactly = 0) { engagement.progress(any()) }
    }

    @Test
    fun `Jeu masque retire l'anneau et ne lit plus rien, la deconnexion aussi`() = runTest {
        every { engagement.progress(any()) } returns MutableStateFlow(CacheResult.Fresh(progressWithActs(true, true, false), 0L))
        val vm = viewModel()
        vm.warmUpIfAuthenticated(true)
        assertThat(vm.actsRing.value).isEqualTo(GameActsRing(done = 2, total = 3))

        gamePrefs.set(hidden = true)
        assertThat(vm.actsRing.value).isNull()

        gamePrefs.set(hidden = false)
        assertThat(vm.actsRing.value).isEqualTo(GameActsRing(done = 2, total = 3))

        vm.warmUpIfAuthenticated(false)
        assertThat(vm.actsRing.value).isNull()
    }

    @Test
    fun `un cache vide ou sans bloc de jeu ne dessine aucun anneau`() = runTest {
        every { engagement.progress(any()) } returns MutableStateFlow(CacheResult.Empty)
        val vm = viewModel()
        vm.warmUpIfAuthenticated(true)

        assertThat(vm.actsRing.value).isNull()
    }

    @Test
    fun `un acte realise ailleurs rallume un segment sans requete de plus`() = runTest {
        val cached = MutableStateFlow<CacheResult<ApiEngagementProgress>>(CacheResult.Fresh(progressWithActs(false, false, false), 0L))
        every { engagement.progress(any()) } returns cached
        val vm = viewModel()
        vm.warmUpIfAuthenticated(true)
        assertThat(vm.actsRing.value).isEqualTo(GameActsRing(done = 0, total = 3))

        cached.value = CacheResult.Fresh(progressWithActs(true, false, false), 0L)

        assertThat(vm.actsRing.value).isEqualTo(GameActsRing(done = 1, total = 3))
        verify(exactly = 1) { engagement.progress(any()) }
    }
}
