package me.meeshy.sdk.notification

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.model.RegisterDeviceTokenResponse
import me.meeshy.sdk.model.UnregisterDeviceTokenRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.net.rawApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** User notifications — port of NotificationService (NotificationService.swift). */
@Singleton
class NotificationRepository @Inject constructor(
    private val notificationApi: NotificationApi,
    private val clock: CacheClock = SystemCacheClock,
) {
    // In-memory cache, mirrors PostRepository.feedStream (ARCHITECTURE.md §4).
    private val _notificationsCache = MutableStateFlow<List<ApiNotification>?>(null)
    private val _notificationsSyncedAt = MutableStateFlow<Long?>(null)
    private val _unreadCount = MutableStateFlow(0)
    private val _hasMore = MutableStateFlow(false)
    
    /**
     * L'ANCRE que le serveur a servie avec la dernière page (#4901) — empruntée
     * verbatim par [loadMore], jamais composée ici. `null` = gateway antérieur
     * (aucun curseur servi) : le repli par RANG reste formulable, avec son
     * défaut connu et VISIBLE (une insertion en tête fait resservir une ligne —
     * le doublon est le signal, il ne se masque plus).
     */
    private var nextCursor: String? = null

    /** The server's unread count, kept fresh alongside every [notificationsStream] revalidate. */
    val unreadCountStream: StateFlow<Int> = _unreadCount.asStateFlow()

    /** Whether the server reports another page beyond the currently cached notifications. */
    val hasMoreStream: StateFlow<Boolean> = _hasMore.asStateFlow()

    /**
     * Cache-first notification stream (ARCHITECTURE.md §4, feature-parity §M). An in-memory L1
     * cache serves stale data immediately; background revalidation is triggered on staleness —
     * same shape as [me.meeshy.sdk.post.PostRepository.feedStream].
     */
    fun notificationsStream(
        policy: CachePolicy = CachePolicy.Notifications,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiNotification>>> =
        combine(_notificationsCache, _notificationsSyncedAt) { data, syncedAt -> data to syncedAt }
            .distinctUntilChanged()
            .transformLatest { (data, syncedAt) ->
                if (data == null) {
                    emit(CacheResult.Empty)
                    revalidateNotifications(onSyncError)
                    return@transformLatest
                }
                val age = syncedAt?.let { clock.nowMillis() - it } ?: Long.MAX_VALUE
                when {
                    age <= policy.freshForMillis -> emit(CacheResult.Fresh(data, age))
                    age <= policy.keepForMillis -> {
                        emit(CacheResult.Stale(data, age))
                        revalidateNotifications(onSyncError)
                    }
                    else -> {
                        emit(CacheResult.Syncing(data))
                        revalidateNotifications(onSyncError)
                    }
                }
            }

    /** Forces a revalidation regardless of freshness — the pull-to-refresh entry point. */
    suspend fun refresh() = revalidateNotifications()

    /**
     * A real-time `notification:new` arrival (feature-parity §M) prepends into the SAME cache
     * [notificationsStream] serves — a live notification is never silently overwritten by the
     * next observer's re-read or a concurrent revalidate. Dedupes by id (a REST-list race or a
     * duplicate delivery is a no-op) and bumps [unreadCountStream] only when unread.
     */
    fun prependLive(notification: ApiNotification) {
        val current = _notificationsCache.value ?: emptyList()
        if (current.any { it.id == notification.id }) return
        _notificationsCache.value = listOf(notification) + current
        if (!notification.state.isRead) _unreadCount.update { it + 1 }
    }

    /**
     * A `notification:read` arriving on the socket — from ANOTHER device, or the echo of this
     * device's OWN [markAsRead] (the gateway broadcasts to every socket in `ROOMS.user`,
     * originator included) — applies the read state to the shared cache. A row already read
     * (this device's own optimistic mutation already landed, or a duplicate delivery) is a
     * no-op, so the echo case never double-decrements [unreadCountStream].
     */
    fun applyRead(notificationId: String) {
        val current = _notificationsCache.value ?: return
        val wasUnread = current.firstOrNull { it.id == notificationId }?.state?.isRead == false
        if (!wasUnread) return
        _notificationsCache.value = current.map {
            if (it.id == notificationId) it.copy(state = it.state.copy(isRead = true)) else it
        }
        _unreadCount.update { (it - 1).coerceAtLeast(0) }
    }

    /**
     * `notification:read-bulk` — a bulk mark-as-read the gateway applied via `updateMany`/
     * `$runCommandRaw`, which returns no ids to enumerate; the event instead announces the
     * PREDICATE it applied, replayed here through the shared, single-source-of-truth
     * [notificationMatchesReadBulkScope] (a local reimplementation would risk marking a
     * different row set than the server did). [unreadCountStream] is deliberately left
     * untouched: this cache is a partial (paginated) view, so it matches fewer rows than the
     * server marked — decrementing from this predicate would make the badge drift.
     * `notification:counts`, emitted right after by the gateway, is what corrects it — mirrors
     * web's `handleNotificationReadBulk`.
     */
    fun applyReadBulk(scope: NotificationReadBulkScope) {
        val current = _notificationsCache.value ?: return
        val touched = current.any { !it.state.isRead && notificationMatchesReadBulkScope(scope, it) }
        if (!touched) return
        _notificationsCache.value = current.map {
            if (!it.state.isRead && notificationMatchesReadBulkScope(scope, it)) {
                it.copy(state = it.state.copy(isRead = true))
            } else {
                it
            }
        }
    }

    /**
     * A `notification:deleted` arriving on the socket — from another device, or the echo of
     * this device's own [delete] — removes the row from the shared cache. Mirrors [applyRead]'s
     * echo-safety: a row already absent (this device's own optimistic removal already landed)
     * is a no-op.
     */
    fun applyDeleted(notificationId: String) {
        val current = _notificationsCache.value ?: return
        val existing = current.firstOrNull { it.id == notificationId } ?: return
        _notificationsCache.value = current.filterNot { it.id == notificationId }
        if (!existing.state.isRead) _unreadCount.update { (it - 1).coerceAtLeast(0) }
    }

    /**
     * `notification:deleted-bulk` — symmetric of [applyReadBulk] on the PURGE side, replayed
     * through the shared [notificationMatchesDeletedBulkScope]. [unreadCountStream] is not a
     * precaution here but a CONSEQUENCE of the predicate: every row the gateway purges this way
     * was already read (`deleteMany({ isRead: true })`), so it was never counted in `unread`.
     */
    fun applyDeletedBulk(scope: NotificationDeletedBulkScope) {
        val current = _notificationsCache.value ?: return
        val touched = current.any { notificationMatchesDeletedBulkScope(scope, it) }
        if (!touched) return
        _notificationsCache.value = current.filterNot { notificationMatchesDeletedBulkScope(scope, it) }
    }

    /**
     * `notification:counts` — the gateway's server-authoritative resync, emitted after every
     * notification mutation (this device's or another's). Without it the badge only corrects
     * on the next full refetch; [applyReadBulk]/[applyDeletedBulk] both rely on it for exactly
     * that correction, since their own partial cache cannot recompute the true unread count.
     */
    fun applyCounts(unread: Int) {
        _unreadCount.value = unread
    }

    suspend fun list(
        offset: Int = 0,
        limit: Int = 20,
        unreadOnly: Boolean = false,
        cursor: String? = null,
    ): NetworkResult<List<ApiNotification>> =
        apiCall {
            notificationApi.list(if (cursor === null) offset else null, limit, if (unreadOnly) true else null, cursor)
        }

    /**
     * Fetches the page after the currently cached notifications, appending fresh rows
     * (deduped by id) and refreshing [hasMoreStream] from the server-authoritative
     * `pagination.hasMore` — port of iOS `NotificationListViewModel.loadMore`. A no-op before
     * the first page has loaded (nothing to paginate from yet) or once the server has already
     * said there is no further page; a failure leaves the cache and [hasMoreStream] untouched
     * so the next scroll simply retries.
     */
    suspend fun loadMore(): NetworkResult<Unit> {
        val current = _notificationsCache.value ?: return NetworkResult.Success(Unit)
        if (!_hasMore.value) return NetworkResult.Success(Unit)
        // Le CURSEUR gagne (#4901) : l'ancre servie est relayée verbatim, et la
        // tranche est insensible aux insertions en tête. Le RANG ne reste que
        // face à un gateway antérieur — et SANS dédoublonnage : l'union par
        // curseur est propre par construction, et au rang le doublon est le
        // SIGNAL (le `filterNot` d'avant supprimait la ligne perdue avec lui).
        val ancre = nextCursor
        return when (
            val result = pagedApiCall {
                notificationApi.list(if (ancre === null) current.size else null, PAGE_SIZE, null, ancre)
            }
        ) {
            is NetworkResult.Success -> {
                _notificationsCache.value = current + result.data.data
                _hasMore.value = result.data.pagination?.hasMore ?: false
                nextCursor = result.data.pagination?.nextCursor
                NetworkResult.Success(Unit)
            }
            is NetworkResult.Failure -> result
        }
    }

    /** The gateway returns `{ success, count }` rather than the standard envelope. */
    suspend fun unreadCount(): NetworkResult<Int> =
        rawApiCall { notificationApi.unreadCount().count }

    /**
     * Optimistic: flips `isRead` in the shared cache before the network call, rolls back on
     * failure. The rollback is TARGETED — it remaps whichever list is current at that point,
     * flipping only [notificationId] back to unread — never a wholesale restore of the
     * pre-mutation snapshot, which would also clobber any [applyRead]/[applyDeleted]/
     * [prependLive] arrival that landed on the cache while this call was in flight.
     */
    suspend fun markAsRead(notificationId: String): NetworkResult<ApiNotification> {
        val previous = _notificationsCache.value
        val wasUnread = previous?.firstOrNull { it.id == notificationId }?.state?.isRead == false
        _notificationsCache.value = previous?.map {
            if (it.id == notificationId) it.copy(state = it.state.copy(isRead = true)) else it
        }
        if (wasUnread) _unreadCount.update { (it - 1).coerceAtLeast(0) }

        val result = apiCall { notificationApi.markAsRead(notificationId) }
        if (result is NetworkResult.Failure) {
            _notificationsCache.update { current ->
                current?.map {
                    if (it.id == notificationId) it.copy(state = it.state.copy(isRead = false)) else it
                }
            }
            if (wasUnread) _unreadCount.update { it + 1 }
        }
        return result
    }

    /**
     * Optimistic: flips every `isRead` in the shared cache before the network call, rolls back
     * on failure. The rollback is TARGETED to the ids that were unread BEFORE this call (never
     * a wholesale restore of the pre-mutation snapshot — see [markAsRead]'s doc-comment), and
     * only reverts rows still `isRead` when the failure lands, so a concurrent [applyDeleted]
     * removal or a genuine [applyRead] confirmation for one of those ids is never undone.
     * [unreadCountStream] is corrected by the DELTA actually reverted, not a captured absolute
     * value that could itself be stale by the time the failure lands.
     */
    suspend fun markAllAsRead(): NetworkResult<Int> {
        val previous = _notificationsCache.value
        val previouslyUnreadIds = previous.orEmpty()
            .filter { !it.state.isRead }
            .mapTo(HashSet()) { it.id }
        _notificationsCache.value = previous?.map { it.copy(state = it.state.copy(isRead = true)) }
        _unreadCount.value = 0

        val result = rawApiCall { notificationApi.markAllAsRead().count ?: 0 }
        if (result is NetworkResult.Failure) {
            val current = _notificationsCache.value
            val revertedIds = current.orEmpty()
                .filter { it.id in previouslyUnreadIds && it.state.isRead }
                .mapTo(HashSet()) { it.id }
            _notificationsCache.value = current?.map {
                if (it.id in revertedIds) it.copy(state = it.state.copy(isRead = false)) else it
            }
            _unreadCount.update { it + revertedIds.size }
        }
        return result
    }

    /**
     * Optimistic: removes the row from the shared cache before the network call, rolls back
     * on failure. A deleted row that was unread also decrements [unreadCountStream] — mirrors
     * [markAsRead]'s exact optimistic-mutation shape. Port of iOS `NotificationRowView`'s
     * trailing swipe / `NotificationListViewModel.deleteNotification`. The rollback is
     * TARGETED — it reinserts only the removed row into whichever list is current at that
     * point (deduped by id, like [prependLive]), never a wholesale restore of the pre-mutation
     * snapshot.
     */
    suspend fun delete(notificationId: String): NetworkResult<Unit> {
        val previous = _notificationsCache.value
        val removed = previous?.firstOrNull { it.id == notificationId }
        val wasUnread = removed?.state?.isRead == false
        _notificationsCache.value = previous?.filterNot { it.id == notificationId }
        if (wasUnread) _unreadCount.update { (it - 1).coerceAtLeast(0) }

        val result = apiCall { notificationApi.delete(notificationId) }
        if (result is NetworkResult.Failure) {
            if (removed != null) {
                _notificationsCache.update { current ->
                    val list = current.orEmpty()
                    if (list.any { it.id == notificationId }) list else listOf(removed) + list
                }
            }
            if (wasUnread) _unreadCount.update { it + 1 }
        }
        return result
    }

    suspend fun registerDeviceToken(token: String): NetworkResult<RegisterDeviceTokenResponse> =
        apiCall { notificationApi.registerDeviceToken(RegisterDeviceTokenRequest(token = token, platform = "android")) }

    suspend fun unregisterDeviceToken(token: String): NetworkResult<Unit> =
        apiCall { notificationApi.unregisterDeviceToken(UnregisterDeviceTokenRequest(token = token)) }

    private suspend fun revalidateNotifications(onError: (Throwable) -> Unit = {}) {
        when (val result = pagedApiCall { notificationApi.list(0, PAGE_SIZE, null) }) {
            is NetworkResult.Success -> {
                _notificationsCache.value = result.data.data
                _notificationsSyncedAt.value = clock.nowMillis()
                _hasMore.value = result.data.pagination?.hasMore ?: false
                nextCursor = result.data.pagination?.nextCursor
            }
            is NetworkResult.Failure -> {
                onError(Exception(result.error.message))
                return
            }
        }
        val countResult = unreadCount()
        if (countResult is NetworkResult.Success) {
            _unreadCount.value = countResult.data
        }
    }

    /**
     * Resets this per-process singleton to its cold-start state — called from
     * [me.meeshy.sdk.session.SessionTeardown.wipe] on logout/account-switch so a
     * second account signing in on the same device never inherits the previous
     * account's cached notifications or unread count.
     */
    fun clear() {
        _notificationsCache.value = null
        _notificationsSyncedAt.value = null
        _unreadCount.value = 0
        _hasMore.value = false
        nextCursor = null
    }

    private companion object {
        const val PAGE_SIZE = 20
    }
}
