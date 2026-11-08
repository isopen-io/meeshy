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
 * `markAsRead`/`markAllRead` and the app-level `NotificationIngestPipeline` (live arrivals) all mutate the SAME
 * repository-owned cache, so every consumer of the stream (a pull-to-refresh, another screen)
 * stays in sync without a manual merge here. Live arrivals and gap/reconnect resyncs are app-level
 * (`NotificationIngestPipeline`, `NotificationGapResyncCoordinator`): this screen owns none of them.
 */
@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
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
     * Tirer pour rafraîchir de marque : suspend jusqu'au retour du réseau, pour que l'indicateur reste armé
     * pendant la revalidation. Un échec se relance au geste (haptique d'erreur) sans jamais effacer le cache affiché.
     */
    suspend fun pullRefresh() {
        notificationRepository.refresh()
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
                categoryRows = notificationRepository.cachedItems(category.scope()).orEmpty(),
                categoryHasMore = categoryPaging[category]?.hasMore ?: false,
                isCategoryLoading = false,
                isLoadingMore = false,
                loadDidFail = false,
            )
        }
        if (category != NotificationFilterCategory.ALL) fetchCategory(category, append = false)
    }

    private var categoryJob: Job? = null

    /** Le curseur et le « reste-t-il » PROPRES à chaque catégorie : revenir à une puce reprend où elle en était. */
    private val categoryPaging = HashMap<NotificationFilterCategory, CategoryPaging>()

    private data class CategoryPaging(val nextCursor: String?, val hasMore: Boolean)

    private fun fetchCategory(category: NotificationFilterCategory, append: Boolean) {
        categoryJob?.cancel()
        val scope = category.scope()
        val paging = categoryPaging[category]
        val held = _state.value.categoryRows
        val cursor = if (append) paging?.nextCursor else null
        _state.update { it.copy(isCategoryLoading = !append && it.filteredNotifications.isEmpty(), isLoadingMore = append) }
        categoryJob = viewModelScope.launch {
            val result = try {
                notificationRepository.listScopePage(scope = scope, cursor = cursor, offset = if (append) held.size else 0)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            if (_state.value.selectedCategory != category) return@launch
            val page = (result as? NetworkResult.Success)?.data
            val rows = page?.let {
                val known = if (append) _state.value.categoryRows else emptyList()
                val knownIds = known.mapTo(HashSet()) { row -> row.id }
                known + it.items.filter { row -> row.id !in knownIds }
            }
            if (page != null && rows != null) {
                categoryPaging[category] = CategoryPaging(page.nextCursor, page.hasMore)
                notificationRepository.replaceAll(scope, rows, page.hasMore, page.nextCursor)
            }
            _state.update { current ->
                val settled = current.copy(isCategoryLoading = false, isLoadingMore = false)
                when {
                    page != null && rows != null ->
                        settled.copy(categoryRows = rows, categoryHasMore = page.hasMore, loadDidFail = false)
                    append -> settled
                    else -> settled.copy(loadDidFail = settled.filteredNotifications.isEmpty())
                }
            }
        }
    }

    /**
     * Optimiste, comme iOS : le cache partagé est basculé par le dépôt, et la page servie d'une
     * catégorie l'est ici — une ligne plus ancienne que la première page n'existe que là. Sous une
     * famille consommable ou la puce « Non lues », la ligne lue quitte la liste ; l'échec la rend.
     */
    fun markAsRead(notificationId: String) {
        val wasUnread = _state.value.categoryRows.any { it.id == notificationId && !it.state.isRead }
        if (wasUnread) _state.update { it.copy(categoryRows = it.categoryRows.withRead(setOf(notificationId), isRead = true)) }
        viewModelScope.launch {
            if (notificationRepository.markAsRead(notificationId) is NetworkResult.Failure) {
                if (wasUnread) _state.update { it.copy(categoryRows = it.categoryRows.withRead(setOf(notificationId), isRead = false)) }
                _events.trySend(NotificationsEvent.ActionFailed(R.string.notifications_mark_read_failed))
            }
        }
    }

    fun markAllRead() {
        val unreadIds = _state.value.categoryRows.filterNot { it.state.isRead }.mapTo(HashSet()) { it.id }
        if (unreadIds.isNotEmpty()) _state.update { it.copy(categoryRows = it.categoryRows.withRead(unreadIds, isRead = true)) }
        viewModelScope.launch {
            if (notificationRepository.markAllAsRead() is NetworkResult.Failure) {
                if (unreadIds.isNotEmpty()) _state.update { it.copy(categoryRows = it.categoryRows.withRead(unreadIds, isRead = false)) }
                _events.trySend(NotificationsEvent.ActionFailed(R.string.notifications_mark_all_read_failed))
            }
        }
    }

    /** Swipe-to-delete — port of iOS `NotificationListViewModel.deleteNotification` : retirée tout de suite, remise à sa place si la suppression échoue. */
    fun deleteNotification(notificationId: String) {
        val rows = _state.value.categoryRows
        val index = rows.indexOfFirst { it.id == notificationId }
        val removed = rows.getOrNull(index)
        if (removed != null) _state.update { it.copy(categoryRows = it.categoryRows.filterNot { row -> row.id == notificationId }) }
        viewModelScope.launch {
            if (notificationRepository.delete(notificationId) is NetworkResult.Failure) {
                if (removed != null) _state.update { it.copy(categoryRows = it.categoryRows.reinserted(removed, index)) }
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

private fun List<ApiNotification>.withRead(ids: Set<String>, isRead: Boolean): List<ApiNotification> =
    map { if (it.id in ids && it.state.isRead != isRead) it.copy(state = it.state.copy(isRead = isRead)) else it }

private fun List<ApiNotification>.reinserted(row: ApiNotification, index: Int): List<ApiNotification> =
    if (any { it.id == row.id }) this else toMutableList().apply { add(index.coerceIn(0, size), row) }
