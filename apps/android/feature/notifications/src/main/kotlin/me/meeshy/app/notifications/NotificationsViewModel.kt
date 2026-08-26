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
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.sync.SyncSeqTracker
import javax.inject.Inject

data class NotificationsUiState(
    val notifications: List<ApiNotification> = emptyList(),
    val unreadCount: Int = 0,
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    val errorMessage: String? = null,
)

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
     * A `notification:new` arriving while this screen is alive/backing the badge is prepended
     * live into the shared repository cache — an already-known id (REST list beat the socket, or
     * a duplicate delivery) is a no-op rather than a second row (see
     * [NotificationRepository.prependLive]). Mirrors iOS `NotificationCoordinator`'s optimistic
     * unread increment, minus the toast/dedup-window machinery (feature-parity §M — the toast
     * itself is a separate, not-yet-scoped slice; this is real-time DATA only).
     */
    private fun observeRealtime() {
        viewModelScope.launch {
            messageSocketManager.notificationReceived.collect { notification ->
                notificationRepository.prependLive(notification)
            }
        }
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
