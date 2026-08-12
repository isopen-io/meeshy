package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.AnonymousJoinRequest
import me.meeshy.sdk.model.AnonymousJoinResponse
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.LeaveAnonymousRequest
import me.meeshy.sdk.model.ShareLinkInfo
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Share-link (shared-conversation join) REST surface — port of the anonymous
 * endpoints of iOS `ShareLinkService`. These are the **no-JWT** endpoints: guest
 * requests authenticate with the `X-Session-Token` header once joined.
 */
interface ShareLinkApi {
    /** Public link preview — no auth. Port of iOS `getLinkInfo`. */
    @GET("anonymous/link/{identifier}")
    suspend fun getLinkInfo(@Path("identifier") identifier: String): ApiResponse<ShareLinkInfo>

    /** Join a conversation as an anonymous guest. Port of iOS `joinAnonymously`. */
    @POST("anonymous/join/{linkId}")
    suspend fun joinAnonymously(
        @Path("linkId") linkId: String,
        @Body body: AnonymousJoinRequest,
    ): ApiResponse<AnonymousJoinResponse>

    /** End the anonymous session server-side. Port of iOS `leaveAnonymousSession`. */
    @POST("anonymous/leave")
    suspend fun leaveAnonymously(@Body body: LeaveAnonymousRequest): ApiResponse<Unit>
}
