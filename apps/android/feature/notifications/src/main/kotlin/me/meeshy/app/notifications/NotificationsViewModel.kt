package me.meeshy.app.notifications

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationCategoryFeed
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.sdk.net.NetworkResult
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
    /** La panne AVANT le vide : un chargement échoué sur une liste vide ne se lit pas « Aucune notification ». */
    val loadDidFail: Boolean = false,
    /** Les lignes que la passerelle a rendues pour la catégorie choisie (hors [NotificationFilterCategory.ALL]). */
    val categoryRows: List<ApiNotification> = emptyList(),
    val categoryHasMore: Boolean = false,
    val isCategoryLoading: Boolean = false,
    /** Les personnes à qui « Se connecter » est parti depuis cet écran — posé AVANT l'aller-retour. */
    val connectRequestedIds: Set<String> = emptySet(),
    val friendIds: Set<String> = emptySet(),
) {
    /**
     * Les lignes que la liste rend pour la catégorie choisie — miroir de
     * `NotificationListViewModel.filteredNotifications` : la loi de la passerelle ([NotificationFilterCategory.accepts])
     * rejouée sur le cache partagé, plus les lignes que le serveur a rendues pour cette catégorie.
     */
    val filteredNotifications: List<ApiNotification>
        get() = NotificationCategoryFeed.visible(selectedCategory, notifications, categoryRows)

    val canLoadMore: Boolean
        get() = if (selectedCategory == NotificationFilterCategory.ALL) hasMore else categoryHasMore
}

/** Ce que l'écran doit faire UNE fois : un retour d'échec, ou ouvrir la conversation d'un « Écrire ». */
sealed interface NotificationsEvent {
    data class ActionFailed(@StringRes val message: Int) : NotificationsEvent
    data class OpenConversation(val conversationId: String) : NotificationsEvent
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
    private val quickActionPerformer: NotificationQuickActionPerformer,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState(friendIds = quickActionPerformer.friendIds()))
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    private val _events = Channel<NotificationsEvent>(Channel.BUFFERED)
    val events: Flow<NotificationsEvent> = _events.receiveAsFlow()

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
                onSyncError = { error -> _state.update { it.failed(error.message) } },
            ).collect { result ->
                _state.update {
                    when (result) {
                        is CacheResult.Empty -> it.copy(isLoading = true, isSyncing = true, loadDidFail = false)
                        is CacheResult.Fresh -> it.withCache(result.value, isSyncing = false)
                        is CacheResult.Stale -> it.withCache(result.value, isSyncing = true)
                        is CacheResult.Syncing -> it.withCache(result.value ?: it.notifications, isSyncing = true)
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
                    _state.update { it.failed(e.message) }
                }
            }
        }
    }

    /** Forces a revalidation regardless of freshness — the pull-to-refresh and « Réessayer » entry point. */
    fun load() {
        _state.update { it.copy(loadDidFail = false, isLoading = it.notifications.isEmpty()) }
        viewModelScope.launch {
            try {
                notificationRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.failed(e.message) }
            }
        }
        val category = _state.value.selectedCategory
        if (category != NotificationFilterCategory.ALL) fetchCategory(category, append = false)
    }

    /**
     * Infinite scroll, under EVERY chip (iOS paginates the selected category's own server list):
     * [NotificationFilterCategory.ALL] extends the shared cache, a category extends its own page.
     * Re-entrancy guarded so a fast double-scroll never fires two overlapping fetches; a failed
     * page is silent and the next scroll retries.
     */
    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || !current.canLoadMore) return
        if (current.selectedCategory != NotificationFilterCategory.ALL) {
            fetchCategory(current.selectedCategory, append = true)
            return
        }
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
     * Selects a chip. The chip lights and the list redraws AT ONCE from what is already loaded
     * (the cache projection), then the category's own server page arrives without a spinner —
     * a category whose rows are older than the shared first page is no longer shown empty (#8958).
     */
    fun selectCategory(category: NotificationFilterCategory) {
        if (_state.value.selectedCategory == category) return
        categoryJob?.cancel()
        _state.update {
            it.copy(
                selectedCategory = category,
                categoryRows = emptyList(),
                categoryHasMore = false,
                isCategoryLoading = false,
                isLoadingMore = false,
                loadDidFail = false,
            )
        }
        if (category != NotificationFilterCategory.ALL) fetchCategory(category, append = false)
    }

    private var categoryJob: Job? = null

    private fun fetchCategory(category: NotificationFilterCategory, append: Boolean) {
        categoryJob?.cancel()
        val query = category.serverQuery
        val offset = if (append) _state.value.categoryRows.size else 0
        _state.update { it.copy(isCategoryLoading = !append && it.filteredNotifications.isEmpty(), isLoadingMore = append) }
        categoryJob = viewModelScope.launch {
            val result = try {
                notificationRepository.list(
                    offset = offset,
                    limit = CATEGORY_PAGE_SIZE,
                    unreadOnly = query.unreadOnly,
                    types = query.types,
                    hideReadTypes = query.hideReadTypes,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            _state.update { current ->
                if (current.selectedCategory != category) return@update current
                val settled = current.copy(isCategoryLoading = false, isLoadingMore = false)
                when (result) {
                    is NetworkResult.Success -> {
                        val known = if (append) settled.categoryRows else emptyList()
                        val knownIds = known.mapTo(HashSet()) { it.id }
                        settled.copy(
                            categoryRows = known + result.data.filter { it.id !in knownIds },
                            categoryHasMore = result.data.size >= CATEGORY_PAGE_SIZE,
                            loadDidFail = false,
                        )
                    }
                    else -> if (append) settled else settled.copy(loadDidFail = settled.filteredNotifications.isEmpty())
                }
            }
        }
    }

    fun markAsRead(notificationId: String) {
        viewModelScope.launch {
            if (notificationRepository.markAsRead(notificationId) is NetworkResult.Failure) {
                _events.trySend(NotificationsEvent.ActionFailed(R.string.notifications_mark_read_failed))
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            if (notificationRepository.markAllAsRead() is NetworkResult.Failure) {
                _events.trySend(NotificationsEvent.ActionFailed(R.string.notifications_mark_all_read_failed))
            }
        }
    }

    /** Swipe-to-delete — port of iOS `NotificationListViewModel.deleteNotification`. */
    fun deleteNotification(notificationId: String) {
        _state.update { it.copy(categoryRows = it.categoryRows.filterNot { row -> row.id == notificationId }) }
        viewModelScope.launch {
            if (notificationRepository.delete(notificationId) is NetworkResult.Failure) {
                _events.trySend(NotificationsEvent.ActionFailed(R.string.notifications_delete_failed))
            }
        }
    }

    /**
     * Un geste de rangée. « Écrire » ouvre ailleurs ; « Se connecter » s'affiche envoyé TOUT DE
     * SUITE et se défait s'il échoue (miroir de `runQuickAction`, iOS). La notification est lue
     * dans les deux cas : on y a répondu.
     */
    fun performQuickAction(notification: ApiNotification, action: NotificationQuickAction) {
        markAsRead(notification.id)
        if (action is NotificationQuickAction.Connect) {
            _state.update { it.copy(connectRequestedIds = it.connectRequestedIds + action.userId) }
        }
        viewModelScope.launch {
            when (val outcome = quickActionPerformer.perform(action)) {
                is QuickActionOutcome.OpenConversation -> _events.trySend(NotificationsEvent.OpenConversation(outcome.conversationId))
                is QuickActionOutcome.Connected -> Unit
                is QuickActionOutcome.Failed -> {
                    if (action is NotificationQuickAction.Connect) {
                        _state.update { it.copy(connectRequestedIds = it.connectRequestedIds - action.userId) }
                    }
                    _events.trySend(NotificationsEvent.ActionFailed(failureMessage(action)))
                }
            }
        }
    }

    @StringRes
    private fun failureMessage(action: NotificationQuickAction): Int = when (action) {
        is NotificationQuickAction.Connect -> R.string.notifications_quick_connect_failed
        is NotificationQuickAction.Write -> R.string.notifications_quick_write_failed
    }

    private companion object {
        const val CATEGORY_PAGE_SIZE = 30
    }
}

private fun NotificationsUiState.failed(message: String?): NotificationsUiState =
    copy(isSyncing = false, isLoading = false, errorMessage = message, loadDidFail = notifications.isEmpty())

/**
 * Le cache a changé : la liste servie d'une catégorie perd les lignes qui en sont parties
 * (suppression ailleurs, socket) — elle ne les ressuscite pas.
 */
private fun NotificationsUiState.withCache(value: List<ApiNotification>, isSyncing: Boolean): NotificationsUiState =
    copy(
        notifications = value,
        isLoading = false,
        isSyncing = isSyncing,
        loadDidFail = false,
        categoryRows = NotificationCategoryFeed.withoutRemoved(categoryRows, notifications, value),
    )
