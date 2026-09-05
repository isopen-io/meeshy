package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.notification.observeNotificationSync
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.sync.SyncSeqTracker
import javax.inject.Inject

data class NotificationsUiState(
    val notifications: List<ApiNotification> = emptyList(),
    val unreadCount: Int = 0,
    val selectedCategory: NotificationFilterCategory = NotificationFilterCategory.ALL,
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val errorMessage: String? = null,
) {
    /**
     * The rows the list actually renders for the selected chip — port of iOS
     * `NotificationListViewModel.filteredNotifications`. The full [notifications] list stays the
     * single source (the badge count, pagination and socket prepend all work off it); the chip is a
     * pure client-side projection over it, so switching chips never refetches.
     */
    val filteredNotifications: List<ApiNotification>
        get() = selectedCategory.filter(notifications)
}

/**
 * Cache-first (ARCHITECTURE.md §4, feature-parity §M): [NotificationRepository.notificationsStream]
 * and [NotificationRepository.unreadCountStream] are the single source of truth — this ViewModel
 * only projects them into [NotificationsUiState], it never holds a second copy of the list.
 * `markAsRead`/`markAllRead`/a live socket arrival ([observeRealtime]) all mutate the SAME
 * repository-owned cache, so every consumer of the stream (a pull-to-refresh, another screen)
 * stays in sync without a manual merge here.
 */
@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
    private val messageSocketManager: MessageSocketManager,
    private val syncSeqTracker: SyncSeqTracker,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        observeNotifications()
        observeUnreadCount()
        observeHasMore()
        observeRealtime()
        observeSyncGaps()
    }

    private fun observeNotifications() {
        viewModelScope.launch {
            notificationRepository.notificationsStream(
                onSyncError = { error -> _state.update { it.copy(isSyncing = false, errorMessage = error.message) } },
            ).collect { result ->
                _state.update {
                    when (result) {
                        is CacheResult.Empty -> it.copy(isLoading = true, isSyncing = true)
                        is CacheResult.Fresh -> it.copy(notifications = result.value, isLoading = false, isSyncing = false)
                        is CacheResult.Stale -> it.copy(notifications = result.value, isLoading = false, isSyncing = true)
                        is CacheResult.Syncing -> it.copy(
                            notifications = result.value ?: it.notifications,
                            isLoading = false,
                            isSyncing = true,
                        )
                    }
                }
            }
        }
    }

    private fun observeUnreadCount() {
        viewModelScope.launch {
            notificationRepository.unreadCountStream.collect { count ->
                _state.update { it.copy(unreadCount = count) }
            }
        }
    }

    private fun observeHasMore() {
        viewModelScope.launch {
            notificationRepository.hasMoreStream.collect { hasMore ->
                _state.update { it.copy(hasMore = hasMore) }
            }
        }
    }

    /**
     * A `notification:new` arriving while this screen is alive/backing the badge, plus the four
     * lifecycle events a notification emits afterward (`notification:read`,
     * `notification:read-bulk`, `notification:deleted`, `notification:deleted-bulk`) and the
     * server-authoritative `notification:counts` resync (issue notif-sync) — all applied to the
     * SAME repository-owned cache via [observeNotificationSync]. That binding is ALSO run from an
     * app-scoped ViewModel ([me.meeshy.app.navigation.ChromeViewModel]): this screen's own copy
     * only covers the SharedFlow events (`replay = 0`) that happen to arrive while it is open —
     * every apply here is idempotent, so running it from both scopes at once is safe, never a
     * double count. Mirrors iOS/web's equivalent socket handlers
     * (`notification-socketio.singleton.ts`).
     */
    private fun observeRealtime() {
        viewModelScope.observeNotificationSync(notificationRepository, messageSocketManager)
    }

    /**
     * SyncEngine — décision APP-SIDE sur le hook que le SDK expose
     * ([SyncSeqTracker.gapDetected], alimenté par `MessageSocketManager`) : un trou
     * de séquence prouve que des `notification:new` ne sont jamais arrivés (socket
     * coupée, event perdu), et rien d'autre ne les rattraperait tant que le cache
     * reste frais. Miroir du coordinateur iOS `NotificationGapResyncCoordinator`.
     *
     * [NotificationRepository.refresh] est IDEMPOTENT (il réécrit la vérité serveur,
     * déduplication par id inhérente), donc sans doublon vis-à-vis de la
     * persistance temps réel de [observeRealtime].
     *
     * Pas de débounce, contrairement à iOS : un trou avance le curseur, donc une
     * rafale d'events n'en produit qu'UN. L'échec est absorbé — laisser
     * l'exception remonter tuerait le collecteur, et avec lui toute resync
     * ultérieure pour la durée de vie du ViewModel.
     */
    private fun observeSyncGaps() {
        viewModelScope.launch {
            syncSeqTracker.gapDetected.collect {
                try {
                    notificationRepository.refresh()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    _state.update { it.copy(isSyncing = false, errorMessage = e.message) }
                }
            }
        }
    }

    /** Forces a revalidation regardless of freshness — the pull-to-refresh entry point. */
    fun load() {
        viewModelScope.launch {
            try {
                notificationRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isSyncing = false, errorMessage = e.message) }
            }
        }
    }

    /**
     * Infinite scroll: fetch the page after the currently loaded notifications. Re-entrancy
     * guarded so a fast double-scroll never fires two overlapping fetches, and inert once the
     * repository reports no further page — mirror of iOS `NotificationListViewModel.loadMore`.
     * A failed page is silent (the repository leaves its cache/`hasMoreStream` untouched, so the
     * next scroll simply retries).
     */
    fun loadMore() {
        // iOS paginates only under the ALL chip; a category chip filters an already-loaded list
        // client-side, so fetching further pages while it hides them would be wasted work.
        if (_state.value.selectedCategory != NotificationFilterCategory.ALL) return
        if (_state.value.isLoadingMore || !_state.value.hasMore) return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            try {
                notificationRepository.loadMore()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Silent: the next scroll re-triggers the fetch.
            } finally {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    /**
     * Selects a filter chip — a pure, network-free state change (the list is already loaded).
     * Re-selecting the active chip is inert. Mirror of iOS setting `selectedCategory`/`unreadOnly`.
     */
    fun selectCategory(category: NotificationFilterCategory) {
        if (_state.value.selectedCategory == category) return
        _state.update { it.copy(selectedCategory = category) }
    }

    fun markAsRead(notificationId: String) {
        viewModelScope.launch { notificationRepository.markAsRead(notificationId) }
    }

    fun markAllRead() {
        viewModelScope.launch { notificationRepository.markAllAsRead() }
    }

    /** Swipe-to-delete — port of iOS `NotificationListViewModel.deleteNotification`. */
    fun deleteNotification(notificationId: String) {
        viewModelScope.launch { notificationRepository.delete(notificationId) }
    }
}
