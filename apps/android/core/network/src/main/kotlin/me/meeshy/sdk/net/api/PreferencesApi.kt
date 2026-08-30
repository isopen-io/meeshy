package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiCategory
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateCategoryBody
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * User-preference sync surface — mirrors the gateway `me/preferences/{category}` routes.
 *
 * Each category has a `PATCH` that partially updates the stored block; the gateway merges
 * over the current value and is idempotent, so a full-snapshot body is safe to replay. The
 * response body is the updated block, but the device-local store is the UI source of truth,
 * so callers ignore it ([ApiResponse]<[Unit]>).
 */
interface PreferencesApi {
    /**
     * The user's conversation-category corpus in display order — the read side of the
     * gateway `GET /me/preferences/categories` route (paginated envelope; the device
     * caches the full snapshot, so callers request a single wide page). Feeds the
     * cache-first `CategoryRepository`.
     */
    @GET("me/preferences/categories")
    suspend fun getCategories(
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiCategory>>

    /**
     * Creates a new conversation category — the write side of the picker's "create"
     * affordance ([me.meeshy.sdk.model.CategorySubmit.Create]). The gateway assigns
     * the id and a display order, returned in the response body.
     */
    @POST("me/preferences/categories")
    suspend fun createCategory(@Body body: CreateCategoryBody): ApiResponse<ApiCategory>

    @PATCH("me/preferences/notification")
    suspend fun updateNotification(@Body body: NotificationPreferenceSyncBody): ApiResponse<Unit>

    @PATCH("me/preferences/privacy")
    suspend fun updatePrivacy(@Body body: PrivacyPreferenceSyncBody): ApiResponse<Unit>

    /**
     * Re-reads the stored notification block — the READ half of [updateNotification],
     * added for issue #4133. The device store stays the UI source of truth, so this is
     * not a hydration path: it is what `user:preferences-updated` (category scope) asks
     * for when another device changed the block, the broadcast carrying only the category
     * NAME and never its content.
     *
     * The response decodes into the same [NotificationPreferenceSyncBody] the PATCH sends
     * — the gateway's block is that contract exactly — and
     * [NotificationPreferenceSyncBody.toPreferences] folds it back onto the local block.
     */
    @GET("me/preferences/notification")
    suspend fun getNotification(): ApiResponse<NotificationPreferenceSyncBody>

    /**
     * Re-reads the stored privacy block (issue #4133), the READ half of [updatePrivacy].
     *
     * The response carries the gateway's whole privacy block, of which this body decodes
     * the twelve editable toggles; the lenient decoder drops the encryption keys, which
     * Android renders read-only and must never overwrite from the wire. See
     * [PrivacyPreferenceSyncBody.toPreferences].
     */
    @GET("me/preferences/privacy")
    suspend fun getPrivacy(): ApiResponse<PrivacyPreferenceSyncBody>
}
