package me.meeshy.app.notifications

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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Cache-first (feature-parity §M): [NotificationRepository.notificationsStream]/
 * [NotificationRepository.unreadCountStream] are the single source of truth this ViewModel
 * projects — dedup/optimistic-mutation behaviour itself lives (and is tested) in
 * `NotificationRepositoryTest`, not here.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun notification(id: String, isRead: Boolean = false) = ApiNotification(
        id = id,
        state = NotificationState(isRead = isRead, createdAt = "2024-01-01"),
    )

    private var capturedOnSyncError: ((Throwable) -> Unit)? = null

    private fun repository(
        notifications: MutableSharedFlow<CacheResult<List<ApiNotification>>> = MutableSharedFlow(replay = 1),
        unreadCount: MutableStateFlow<Int> = MutableStateFlow(0),
        hasMore: MutableStateFlow<Boolean> = MutableStateFlow(false),
    ): NotificationRepository {
        val repository: NotificationRepository = mockk(relaxed = true)
        every { repository.notificationsStream(any(), any()) } answers {
            capturedOnSyncError = secondArg()
            notifications
        }
        every { repository.unreadCountStream } returns unreadCount
        every { repository.hasMoreStream } returns hasMore
        return repository
    }

    private fun socketManager(events: MutableSharedFlow<ApiNotification> = MutableSharedFlow()): MessageSocketManager {
        val manager: MessageSocketManager = mockk(relaxed = true)
        every { manager.notificationReceived } returns events
        return manager
    }

    @Test
    fun `projects a fresh cache result into state`() = runTest {
        val notifications = MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        val repo = repository(notifications)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        notifications.emit(CacheResult.Fresh(listOf(notification("1"), notification("2")), ageMillis = 0))

        assertThat(vm.state.value.notifications).hasSize(2)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun `an empty cache result shows the loading skeleton`() = runTest {
        val notifications = MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        val repo = repository(notifications)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        notifications.emit(CacheResult.Empty)

        assertThat(vm.state.value.isLoading).isTrue()
        assertThat(vm.state.value.isSyncing).isTrue()
    }

    @Test
    fun `a stale cache result paints immediately while syncing continues`() = runTest {
        val notifications = MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        val repo = repository(notifications)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        notifications.emit(CacheResult.Stale(listOf(notification("1")), ageMillis = 999_999))

        assertThat(vm.state.value.notifications).hasSize(1)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isSyncing).isTrue()
    }

    @Test
    fun `a sync error surfaces the error message`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        capturedOnSyncError?.invoke(RuntimeException("Server error"))

        assertThat(vm.state.value.errorMessage).isEqualTo("Server error")
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun `unread count reflects the repository stream`() = runTest {
        val unreadCount = MutableStateFlow(0)
        val repo = repository(unreadCount = unreadCount)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        unreadCount.value = 3

        assertThat(vm.state.value.unreadCount).isEqualTo(3)
    }

    @Test
    fun `load forces a repository refresh`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.load()

        coVerify(exactly = 1) { repo.refresh() }
    }

    @Test
    fun `markAsRead delegates to the repository`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.markAsRead("n1")

        coVerify(exactly = 1) { repo.markAsRead("n1") }
    }

    @Test
    fun `markAllRead delegates to the repository`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.markAllRead()

        coVerify(exactly = 1) { repo.markAllAsRead() }
    }

    @Test
    fun `deleteNotification delegates to the repository`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.deleteNotification("n1")

        coVerify(exactly = 1) { repo.delete("n1") }
    }

    @Test
    fun `a real-time notification is forwarded to the repository's shared cache`() = runTest {
        val events = MutableSharedFlow<ApiNotification>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(events), SyncSeqTracker())

        val incoming = notification("fresh")
        events.emit(incoming)

        verify(exactly = 1) { repo.prependLive(incoming) }
    }

    /**
     * SyncEngine — un trou dans le `_seq` prouve que des `notification:new` n'ont
     * jamais été livrés. Rien d'autre ne les rattraperait tant que le cache reste
     * frais : le trou DOIT déclencher une revalidation.
     */
    @Test
    fun `a sync seq gap triggers a notification refresh`() = runTest {
        val repo = repository()
        val tracker = SyncSeqTracker()
        NotificationsViewModel(repo, socketManager(), tracker)

        tracker.observe(5L)   // premier event — pas de trou
        tracker.observe(6L)   // contigu — pas de trou
        advanceUntilIdle()
        coVerify(exactly = 0) { repo.refresh() }

        tracker.observe(9L)   // 7, 8 manqués
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.refresh() }
    }

    /** Un refresh qui échoue ne doit pas tuer le collecteur : le trou suivant resync encore. */
    @Test
    fun `a failing gap refresh does not stop later resyncs`() = runTest {
        val repo = repository()
        coEvery { repo.refresh() } throws IllegalStateException("offline")
        val tracker = SyncSeqTracker()
        NotificationsViewModel(repo, socketManager(), tracker)

        tracker.observe(5L)
        tracker.observe(9L)   // trou n°1 — refresh échoue
        advanceUntilIdle()
        tracker.observe(20L)  // trou n°2
        advanceUntilIdle()

        coVerify(exactly = 2) { repo.refresh() }
    }

    // --- Pagination (feature-parity §M "still open") ---

    @Test
    fun `loadMore delegates to the repository when a further page is available`() = runTest {
        val hasMore = MutableStateFlow(true)
        val repo = repository(hasMore = hasMore)
        coEvery { repo.loadMore() } returns NetworkResult.Success(Unit)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.loadMore()

        coVerify(exactly = 1) { repo.loadMore() }
    }

    @Test
    fun `loadMore is inert when the repository reports no further page`() = runTest {
        val hasMore = MutableStateFlow(false)
        val repo = repository(hasMore = hasMore)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.loadMore()

        coVerify(exactly = 0) { repo.loadMore() }
    }

    @Test
    fun `a second loadMore while one is in flight is a no-op`() = runTest {
        val hasMore = MutableStateFlow(true)
        val repo = repository(hasMore = hasMore)
        val pending = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repo.loadMore() } coAnswers { pending.await() }
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.loadMore()
        vm.loadMore()

        coVerify(exactly = 1) { repo.loadMore() }
        pending.complete(NetworkResult.Success(Unit))
    }
}
