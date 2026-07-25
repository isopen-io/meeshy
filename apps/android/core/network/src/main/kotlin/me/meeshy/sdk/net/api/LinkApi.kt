package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Authenticated (JWT) share-link management surface — the owner-facing endpoints
 * of iOS `ShareLinkService`. Distinct from [ShareLinkApi], which holds the no-JWT
 * anonymous guest endpoints.
 */
interface LinkApi {
    /** Create a share link for a conversation. Port of iOS `createShareLink`. */
    @POST("links")
    suspend fun create(@Body body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse>
}
