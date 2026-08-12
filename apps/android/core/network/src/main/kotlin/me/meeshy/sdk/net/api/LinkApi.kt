package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ToggleShareLinkRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Authenticated (JWT) share-link management surface — the owner-facing endpoints
 * of iOS `ShareLinkService`. Distinct from [ShareLinkApi], which holds the no-JWT
 * anonymous guest endpoints.
 */
interface LinkApi {
    /** Create a share link for a conversation. Port of iOS `createShareLink`. */
    @POST("links")
    suspend fun create(@Body body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse>

    /** List the current user's own share links (paginated). Port of iOS `listMyLinks`. */
    @GET("links")
    suspend fun listMyLinks(
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
    ): ApiResponse<List<MyShareLink>>

    /** Aggregated stats for the user's links. Port of iOS `fetchMyStats`. */
    @GET("links/stats")
    suspend fun fetchMyStats(): ApiResponse<MyShareLinkStats>

    /** Activate / deactivate a link by its public `linkId`. Port of iOS `toggleLink`. */
    @PATCH("links/{linkId}/toggle")
    suspend fun toggle(
        @Path("linkId") linkId: String,
        @Body body: ToggleShareLinkRequest,
    ): ApiResponse<Unit>

    /** Delete a link by its public `linkId`. Port of iOS `deleteLink`. */
    @DELETE("links/{linkId}")
    suspend fun delete(@Path("linkId") linkId: String): ApiResponse<Unit>

    /** Extend a link's expiration to a new ISO-8601 `expiresAt`. */
    @PATCH("links/{linkId}/extend")
    suspend fun extend(
        @Path("linkId") linkId: String,
        @Body body: ExtendShareLinkRequest,
    ): ApiResponse<Unit>
}
