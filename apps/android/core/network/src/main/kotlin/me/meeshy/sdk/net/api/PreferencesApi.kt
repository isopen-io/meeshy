package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import retrofit2.http.Body
import retrofit2.http.PATCH

/**
 * User-preference sync surface — mirrors the gateway `me/preferences/{category}` routes.
 *
 * Each category has a `PATCH` that partially updates the stored block; the gateway merges
 * over the current value and is idempotent, so a full-snapshot body is safe to replay. The
 * response body is the updated block, but the device-local store is the UI source of truth,
 * so callers ignore it ([ApiResponse]<[Unit]>).
 */
interface PreferencesApi {
    @PATCH("me/preferences/notification")
    suspend fun updateNotification(@Body body: NotificationPreferenceSyncBody): ApiResponse<Unit>
}
