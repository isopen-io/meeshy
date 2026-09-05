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
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationCountsSocketEvent
import me.meeshy.sdk.notification.NotificationDeletedBulkScope
import me.meeshy.sdk.notification.NotificationDeletedBulkSocketEvent
import me.meeshy.sdk.notification.NotificationDeletedSocketEvent
import me.meeshy.sdk.notification.NotificationReadBulkScope
import me.meeshy.sdk.notification.NotificationReadBulkSocketEvent
import me.meeshy.sdk.notification.NotificationReadSocketEvent
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

    private fun socketManager(
        events: MutableSharedFlow<ApiNotification> = MutableSharedFlow(),
        read: MutableSharedFlow<NotificationReadSocketEvent> = MutableSharedFlow(),
        readBulk: MutableSharedFlow<NotificationReadBulkSocketEvent> = MutableSharedFlow(),
        deleted: MutableSharedFlow<NotificationDeletedSocketEvent> = MutableSharedFlow(),
        deletedBulk: MutableSharedFlow<NotificationDeletedBulkSocketEvent> = MutableSharedFlow(),
        counts: MutableSharedFlow<NotificationCountsSocketEvent> = MutableSharedFlow(),
    ): MessageSocketManager {
        val manager: MessageSocketManager = mockk(relaxed = true)
        every { manager.notificationReceived } returns events
        every { manager.notificationRead } returns read
        every { manager.notificationReadBulk } returns readBulk
        every { manager.notificationDeleted } returns deleted
        every { manager.notificationDeletedBulk } returns deletedBulk
        every { manager.notificationCounts } returns counts
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

    // --- Notification sync family (issue notif-sync) — the other four lifecycle events ---

    @Test
    fun `a socket notification read is forwarded to the repository`() = runTest {
        val read = MutableSharedFlow<NotificationReadSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(read = read), SyncSeqTracker())

        read.emit(NotificationReadSocketEvent(notificationId = "n1"))

        verify(exactly = 1) { repo.applyRead("n1") }
    }

    @Test
    fun `a socket notification read-bulk is forwarded to the repository`() = runTest {
        val readBulk = MutableSharedFlow<NotificationReadBulkSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(readBulk = readBulk), SyncSeqTracker())
        val scope = NotificationReadBulkScope(kind = "all")

        readBulk.emit(NotificationReadBulkSocketEvent(scope))

        verify(exactly = 1) { repo.applyReadBulk(scope) }
    }

    @Test
    fun `a socket notification deleted is forwarded to the repository`() = runTest {
        val deleted = MutableSharedFlow<NotificationDeletedSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(deleted = deleted), SyncSeqTracker())

        deleted.emit(NotificationDeletedSocketEvent(notificationId = "n1"))

        verify(exactly = 1) { repo.applyDeleted("n1") }
    }

    @Test
    fun `a socket notification deleted-bulk is forwarded to the repository`() = runTest {
        val deletedBulk = MutableSharedFlow<NotificationDeletedBulkSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(deletedBulk = deletedBulk), SyncSeqTracker())
        val scope = NotificationDeletedBulkScope(kind = "read")

        deletedBulk.emit(NotificationDeletedBulkSocketEvent(scope))

        verify(exactly = 1) { repo.applyDeletedBulk(scope) }
    }

    @Test
    fun `a socket notification counts is forwarded to the repository`() = runTest {
        val counts = MutableSharedFlow<NotificationCountsSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(counts = counts), SyncSeqTracker())

        counts.emit(NotificationCountsSocketEvent(unread = 5, total = 20))

        verify(exactly = 1) { repo.applyCounts(5) }
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

    // --- Category filter chips (feature-parity §M "Notification center with category filters") ---

    private fun typed(id: String, type: String, isRead: Boolean = false) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = "2024-01-01"),
    )

    private fun vmWith(vararg rows: ApiNotification): NotificationsViewModel {
        val notifications = MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        val vm = NotificationsViewModel(repository(notifications), socketManager(), SyncSeqTracker())
        notifications.tryEmit(CacheResult.Fresh(rows.toList(), ageMillis = 0))
        return vm
    }

    @Test
    fun `the default selected category is ALL`() = runTest {
        val vm = vmWith(typed("1", "new_message"), typed("2", "post_like"))

        assertThat(vm.state.value.selectedCategory).isEqualTo(NotificationFilterCategory.ALL)
        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("1", "2").inOrder()
    }

    @Test
    fun `selecting a category narrows the rendered rows by type only`() = runTest {
        val vm = vmWith(
            typed("m", "new_message", isRead = true),
            typed("r", "post_like"),
            typed("m2", "message_reply"),
        )

        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        assertThat(vm.state.value.selectedCategory).isEqualTo(NotificationFilterCategory.MESSAGES)
        // A read message still shows — the chip filters by type, never by read state.
        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("m", "m2").inOrder()
    }

    @Test
    fun `the UNREAD chip keeps only unread rows across every type`() = runTest {
        val vm = vmWith(
            typed("a", "new_message", isRead = false),
            typed("b", "post_like", isRead = true),
            typed("c", "missed_call", isRead = false),
        )

        vm.selectCategory(NotificationFilterCategory.UNREAD)

        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `the full notifications list stays intact under a filter`() = runTest {
        val vm = vmWith(typed("1", "new_message"), typed("2", "post_like"))

        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        // Badge/pagination source is untouched — only the projection narrows.
        assertThat(vm.state.value.notifications.map { it.id }).containsExactly("1", "2").inOrder()
    }

    @Test
    fun `re-selecting the active category is inert`() = runTest {
        val vm = vmWith(typed("1", "new_message"))
        vm.selectCategory(NotificationFilterCategory.MESSAGES)
        val before = vm.state.value

        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        assertThat(vm.state.value).isSameInstanceAs(before)
    }

    @Test
    fun `loadMore is suppressed while a non-ALL chip is selected`() = runTest {
        val hasMore = MutableStateFlow(true)
        val repo = repository(hasMore = hasMore)
        coEvery { repo.loadMore() } returns NetworkResult.Success(Unit)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)
        vm.loadMore()

        coVerify(exactly = 0) { repo.loadMore() }
    }

    @Test
    fun `loadMore resumes after returning to the ALL chip`() = runTest {
        val hasMore = MutableStateFlow(true)
        val repo = repository(hasMore = hasMore)
        coEvery { repo.loadMore() } returns NetworkResult.Success(Unit)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)
        vm.selectCategory(NotificationFilterCategory.ALL)
        vm.loadMore()

        coVerify(exactly = 1) { repo.loadMore() }
    }
}
