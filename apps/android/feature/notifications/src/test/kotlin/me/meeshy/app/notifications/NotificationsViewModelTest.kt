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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.model.NotificationQuickAction
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
        coEvery { repository.list(any(), any(), any(), any(), any(), any()) } returns NetworkResult.Success(emptyList())
        coEvery { repository.markAsRead(any()) } returns NetworkResult.Success(notification("read"))
        return repository
    }

    private fun performer(): NotificationQuickActionPerformer {
        val performer: NotificationQuickActionPerformer = mockk(relaxed = true)
        every { performer.friendIds() } returns emptySet()
        return performer
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
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        notifications.emit(CacheResult.Fresh(listOf(notification("1"), notification("2")), ageMillis = 0))

        assertThat(vm.state.value.notifications).hasSize(2)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun `an empty cache result shows the loading skeleton`() = runTest {
        val notifications = MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        val repo = repository(notifications)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        notifications.emit(CacheResult.Empty)

        assertThat(vm.state.value.isLoading).isTrue()
        assertThat(vm.state.value.isSyncing).isTrue()
    }

    @Test
    fun `a stale cache result paints immediately while syncing continues`() = runTest {
        val notifications = MutableSharedFlow<CacheResult<List<ApiNotification>>>(replay = 1)
        val repo = repository(notifications)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        notifications.emit(CacheResult.Stale(listOf(notification("1")), ageMillis = 999_999))

        assertThat(vm.state.value.notifications).hasSize(1)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isSyncing).isTrue()
    }

    @Test
    fun `a sync error surfaces the error message`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        capturedOnSyncError?.invoke(RuntimeException("Server error"))

        assertThat(vm.state.value.errorMessage).isEqualTo("Server error")
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun `unread count reflects the repository stream`() = runTest {
        val unreadCount = MutableStateFlow(0)
        val repo = repository(unreadCount = unreadCount)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        unreadCount.value = 3

        assertThat(vm.state.value.unreadCount).isEqualTo(3)
    }

    @Test
    fun `load forces a repository refresh`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.load()

        coVerify(exactly = 1) { repo.refresh() }
    }

    @Test
    fun `markAsRead delegates to the repository`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.markAsRead("n1")

        coVerify(exactly = 1) { repo.markAsRead("n1") }
    }

    @Test
    fun `markAllRead delegates to the repository`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.markAllRead()

        coVerify(exactly = 1) { repo.markAllAsRead() }
    }

    @Test
    fun `deleteNotification delegates to the repository`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.deleteNotification("n1")

        coVerify(exactly = 1) { repo.delete("n1") }
    }

    @Test
    fun `a real-time notification is forwarded to the repository's shared cache`() = runTest {
        val events = MutableSharedFlow<ApiNotification>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(events), SyncSeqTracker(), performer())

        val incoming = notification("fresh")
        events.emit(incoming)

        verify(exactly = 1) { repo.prependLive(incoming) }
    }

    // --- Notification sync family (issue notif-sync) — the other four lifecycle events ---

    @Test
    fun `a socket notification read is forwarded to the repository`() = runTest {
        val read = MutableSharedFlow<NotificationReadSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(read = read), SyncSeqTracker(), performer())

        read.emit(NotificationReadSocketEvent(notificationId = "n1"))

        verify(exactly = 1) { repo.applyRead("n1") }
    }

    @Test
    fun `a socket notification read-bulk is forwarded to the repository`() = runTest {
        val readBulk = MutableSharedFlow<NotificationReadBulkSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(readBulk = readBulk), SyncSeqTracker(), performer())
        val scope = NotificationReadBulkScope(kind = "all")

        readBulk.emit(NotificationReadBulkSocketEvent(scope))

        verify(exactly = 1) { repo.applyReadBulk(scope) }
    }

    @Test
    fun `a socket notification deleted is forwarded to the repository`() = runTest {
        val deleted = MutableSharedFlow<NotificationDeletedSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(deleted = deleted), SyncSeqTracker(), performer())

        deleted.emit(NotificationDeletedSocketEvent(notificationId = "n1"))

        verify(exactly = 1) { repo.applyDeleted("n1") }
    }

    @Test
    fun `a socket notification deleted-bulk is forwarded to the repository`() = runTest {
        val deletedBulk = MutableSharedFlow<NotificationDeletedBulkSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(deletedBulk = deletedBulk), SyncSeqTracker(), performer())
        val scope = NotificationDeletedBulkScope(kind = "read")

        deletedBulk.emit(NotificationDeletedBulkSocketEvent(scope))

        verify(exactly = 1) { repo.applyDeletedBulk(scope) }
    }

    @Test
    fun `a socket notification counts is forwarded to the repository`() = runTest {
        val counts = MutableSharedFlow<NotificationCountsSocketEvent>()
        val repo = repository()
        NotificationsViewModel(repo, socketManager(counts = counts), SyncSeqTracker(), performer())

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
        NotificationsViewModel(repo, socketManager(), tracker, performer())

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
        NotificationsViewModel(repo, socketManager(), tracker, performer())

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
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.loadMore()

        coVerify(exactly = 1) { repo.loadMore() }
    }

    @Test
    fun `loadMore is inert when the repository reports no further page`() = runTest {
        val hasMore = MutableStateFlow(false)
        val repo = repository(hasMore = hasMore)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.loadMore()

        coVerify(exactly = 0) { repo.loadMore() }
    }

    @Test
    fun `a second loadMore while one is in flight is a no-op`() = runTest {
        val hasMore = MutableStateFlow(true)
        val repo = repository(hasMore = hasMore)
        val pending = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repo.loadMore() } coAnswers { pending.await() }
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

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
        val vm = NotificationsViewModel(repository(notifications), socketManager(), SyncSeqTracker(), performer())
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
        // A READ message is consumed content: it leaves the bell (#8958), the unread ones stay.
        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("m2")
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
    fun `selecting a category asks the gateway for that category's own page`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        val query = NotificationFilterCategory.MESSAGES.serverQuery
        coVerify(exactly = 1) {
            repo.list(0, 30, false, null, query.types, query.hideReadTypes)
        }
    }

    @Test
    fun `rows older than the shared first page appear under their category`() = runTest {
        val repo = repository()
        coEvery { repo.list(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Success(listOf(typed("old", "new_message")))
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("old")
    }

    @Test
    fun `a failed category fetch on an empty list shows the error state, not the empty one`() = runTest {
        val repo = repository()
        coEvery { repo.list(any(), any(), any(), any(), any(), any()) } returns
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "boom"))
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        assertThat(vm.state.value.loadDidFail).isTrue()
    }

    @Test
    fun `a category paginates its own list with the offset of what it holds`() = runTest {
        val repo = repository()
        val full = (1..30).map { typed("m$it", "new_message") }
        coEvery { repo.list(0, any(), any(), any(), any(), any()) } returns NetworkResult.Success(full)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)
        vm.loadMore()

        coVerify(exactly = 1) { repo.list(30, 30, false, null, any(), any()) }
        coVerify(exactly = 0) { repo.loadMore() }
    }

    @Test
    fun `loadMore extends the shared cache under the ALL chip`() = runTest {
        val hasMore = MutableStateFlow(true)
        val repo = repository(hasMore = hasMore)
        coEvery { repo.loadMore() } returns NetworkResult.Success(Unit)
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.selectCategory(NotificationFilterCategory.MESSAGES)
        vm.selectCategory(NotificationFilterCategory.ALL)
        vm.loadMore()

        coVerify(exactly = 1) { repo.loadMore() }
    }

    @Test
    fun `a sync error on an empty cache raises the error state and drops the skeleton`() = runTest {
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        capturedOnSyncError?.invoke(RuntimeException("offline"))

        assertThat(vm.state.value.loadDidFail).isTrue()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `a failed markAsRead announces itself once`() = runTest {
        val repo = repository()
        coEvery { repo.markAsRead("n1") } returns NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "x"))
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())

        vm.markAsRead("n1")

        assertThat(vm.events.first())
            .isEqualTo(NotificationsEvent.ActionFailed(me.meeshy.feature.notifications.R.string.notifications_mark_read_failed))
    }

    @Test
    fun `connect shows sent at once and undoes itself when the request fails`() = runTest {
        val performer = performer()
        coEvery { performer.perform(any()) } returns QuickActionOutcome.Failed
        val repo = repository()
        val vm = NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer)

        vm.performQuickAction(typed("n1", "contact_joined"), NotificationQuickAction.Connect("u1"))

        assertThat(vm.state.value.connectRequestedIds).isEmpty()
        assertThat(vm.events.first())
            .isEqualTo(NotificationsEvent.ActionFailed(me.meeshy.feature.notifications.R.string.notifications_quick_connect_failed))
        coVerify { repo.markAsRead("n1") }
    }

    @Test
    fun `connect stays sent once the request left`() = runTest {
        val performer = performer()
        coEvery { performer.perform(any()) } returns QuickActionOutcome.Connected
        val vm = NotificationsViewModel(repository(), socketManager(), SyncSeqTracker(), performer)

        vm.performQuickAction(typed("n1", "contact_joined"), NotificationQuickAction.Connect("u1"))

        assertThat(vm.state.value.connectRequestedIds).containsExactly("u1")
    }

    @Test
    fun `write opens the direct conversation`() = runTest {
        val performer = performer()
        coEvery { performer.perform(any()) } returns QuickActionOutcome.OpenConversation("c9")
        val vm = NotificationsViewModel(repository(), socketManager(), SyncSeqTracker(), performer)

        vm.performQuickAction(typed("n1", "contact_joined"), NotificationQuickAction.Write("u1"))

        assertThat(vm.events.first()).isEqualTo(NotificationsEvent.OpenConversation("c9"))
    }

    private fun categoryVm(repo: NotificationRepository, vararg served: ApiNotification): NotificationsViewModel {
        coEvery { repo.list(any(), any(), any(), any(), any(), any()) } returns NetworkResult.Success(served.toList())
        return NotificationsViewModel(repo, socketManager(), SyncSeqTracker(), performer())
    }

    @Test
    fun `a message row served only by its category leaves the list the moment it is read`() = runTest {
        val repo = repository()
        val answer = CompletableDeferred<NetworkResult<ApiNotification>>()
        coEvery { repo.markAsRead("old") } coAnswers { answer.await() }
        val vm = categoryVm(repo, typed("old", "new_message"))
        vm.selectCategory(NotificationFilterCategory.MESSAGES)

        vm.markAsRead("old")

        assertThat(vm.state.value.filteredNotifications).isEmpty()
        answer.complete(NetworkResult.Success(typed("old", "new_message", isRead = true)))
        assertThat(vm.state.value.filteredNotifications).isEmpty()
    }

    @Test
    fun `a failed markAsRead brings a category-only row back unread`() = runTest {
        val repo = repository()
        coEvery { repo.markAsRead("old") } returns NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "x"))
        val vm = categoryVm(repo, typed("old", "friend_request"))
        vm.selectCategory(NotificationFilterCategory.UNREAD)

        vm.markAsRead("old")

        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("old")
        assertThat(vm.state.value.filteredNotifications.single().state.isRead).isFalse()
    }

    @Test
    fun `markAllRead reads the category rows at once and restores them when it fails`() = runTest {
        val repo = repository()
        val answer = CompletableDeferred<NetworkResult<Int>>()
        coEvery { repo.markAllAsRead() } coAnswers { answer.await() }
        val vm = categoryVm(repo, typed("a", "friend_request"), typed("b", "friend_request"))
        vm.selectCategory(NotificationFilterCategory.UNREAD)

        vm.markAllRead()
        assertThat(vm.state.value.filteredNotifications).isEmpty()

        answer.complete(NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "x")))
        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `a failed delete puts a category-only row back where it was`() = runTest {
        val repo = repository()
        val answer = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { repo.delete("b") } coAnswers { answer.await() }
        val vm = categoryVm(repo, typed("a", "friend_request"), typed("b", "friend_request"), typed("c", "friend_request"))
        vm.selectCategory(NotificationFilterCategory.CONTACTS)

        vm.deleteNotification("b")
        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("a", "c").inOrder()

        answer.complete(NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "x")))
        assertThat(vm.state.value.filteredNotifications.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }
}
