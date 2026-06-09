package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.model.RegisterDeviceTokenResponse
import me.meeshy.sdk.model.UnreadCountResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface NotificationApi {
    /**
     * The gateway returns `{ success, data: [...], pagination, unreadCount }` —
     * structurally an [ApiResponse] whose `data` is the notification list.
     */
    @GET("notifications")
    suspend fun list(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("unreadOnly") unreadOnly: Boolean? = null,
    ): ApiResponse<List<ApiNotification>>

    /** Returns `{ success, count }` — no `data` envelope. */
    @GET("notifications/unread-count")
    suspend fun unreadCount(): UnreadCountResponse

    @POST("notifications/{id}/read")
    suspend fun markAsRead(@Path("id") notificationId: String): ApiResponse<ApiNotification>

    /** Returns `{ success, count }` — no `data` envelope. */
    @POST("notifications/read-all")
    suspend fun markAllAsRead(): MarkReadResponse

    @DELETE("notifications/{id}")
    suspend fun delete(@Path("id") notificationId: String): ApiResponse<Unit>

    @POST("notifications/device-token")
    suspend fun registerDeviceToken(@Body body: RegisterDeviceTokenRequest): ApiResponse<RegisterDeviceTokenResponse>

    @DELETE("notifications/device-token")
    suspend fun unregisterDeviceToken(@Body body: me.meeshy.sdk.model.UnregisterDeviceTokenRequest): ApiResponse<Unit>
}
