package me.meeshy.sdk.notification

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
) {
    suspend fun list(
        offset: Int = 0,
        limit: Int = 20,
        unreadOnly: Boolean = false,
    ): NetworkResult<List<ApiNotification>> =
        apiCall { notificationApi.list(offset, limit, if (unreadOnly) true else null) }

    /** The gateway returns `{ success, count }` rather than the standard envelope. */
    suspend fun unreadCount(): NetworkResult<Int> =
        rawApiCall { notificationApi.unreadCount().count }

    suspend fun markAsRead(notificationId: String): NetworkResult<ApiNotification> =
        apiCall { notificationApi.markAsRead(notificationId) }

    /** The gateway returns `{ success, count }` rather than the standard envelope. */
    suspend fun markAllAsRead(): NetworkResult<Int> =
        rawApiCall { notificationApi.markAllAsRead().count ?: 0 }

    suspend fun delete(notificationId: String): NetworkResult<Unit> =
        apiCall { notificationApi.delete(notificationId) }

    suspend fun registerDeviceToken(token: String): NetworkResult<RegisterDeviceTokenResponse> =
        apiCall { notificationApi.registerDeviceToken(RegisterDeviceTokenRequest(token = token, platform = "android")) }

    suspend fun unregisterDeviceToken(token: String): NetworkResult<Unit> =
        apiCall { notificationApi.unregisterDeviceToken(UnregisterDeviceTokenRequest(token = token)) }
}
