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

    /** The server's unread count, kept fresh alongside every [notificationsStream] revalidate. */
    val unreadCountStream: StateFlow<Int> = _unreadCount.asStateFlow()

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

    suspend fun list(
        offset: Int = 0,
        limit: Int = 20,
        unreadOnly: Boolean = false,
    ): NetworkResult<List<ApiNotification>> =
        apiCall { notificationApi.list(offset, limit, if (unreadOnly) true else null) }

    /** The gateway returns `{ success, count }` rather than the standard envelope. */
    suspend fun unreadCount(): NetworkResult<Int> =
        rawApiCall { notificationApi.unreadCount().count }

    /** Optimistic: flips `isRead` in the shared cache before the network call, rolls back on failure. */
    suspend fun markAsRead(notificationId: String): NetworkResult<ApiNotification> {
        val previous = _notificationsCache.value
        val wasUnread = previous?.firstOrNull { it.id == notificationId }?.state?.isRead == false
        _notificationsCache.value = previous?.map {
            if (it.id == notificationId) it.copy(state = it.state.copy(isRead = true)) else it
        }
        if (wasUnread) _unreadCount.update { (it - 1).coerceAtLeast(0) }

        val result = apiCall { notificationApi.markAsRead(notificationId) }
        if (result is NetworkResult.Failure) {
            _notificationsCache.value = previous
            if (wasUnread) _unreadCount.update { it + 1 }
        }
        return result
    }

    /** Optimistic: flips every `isRead` in the shared cache before the network call, rolls back on failure. */
    suspend fun markAllAsRead(): NetworkResult<Int> {
        val previous = _notificationsCache.value
        val previousUnreadCount = _unreadCount.value
        _notificationsCache.value = previous?.map { it.copy(state = it.state.copy(isRead = true)) }
        _unreadCount.value = 0

        val result = rawApiCall { notificationApi.markAllAsRead().count ?: 0 }
        if (result is NetworkResult.Failure) {
            _notificationsCache.value = previous
            _unreadCount.value = previousUnreadCount
        }
        return result
    }

    suspend fun delete(notificationId: String): NetworkResult<Unit> =
        apiCall { notificationApi.delete(notificationId) }

    suspend fun registerDeviceToken(token: String): NetworkResult<RegisterDeviceTokenResponse> =
        apiCall { notificationApi.registerDeviceToken(RegisterDeviceTokenRequest(token = token, platform = "android")) }

    suspend fun unregisterDeviceToken(token: String): NetworkResult<Unit> =
        apiCall { notificationApi.unregisterDeviceToken(UnregisterDeviceTokenRequest(token = token)) }

    private suspend fun revalidateNotifications(onError: (Throwable) -> Unit = {}) {
        when (val result = list()) {
            is NetworkResult.Success -> {
                _notificationsCache.value = result.data
                _notificationsSyncedAt.value = clock.nowMillis()
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
}
