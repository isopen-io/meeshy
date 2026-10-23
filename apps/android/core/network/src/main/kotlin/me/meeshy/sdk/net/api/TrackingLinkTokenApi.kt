package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.SetTrackingLinkActiveRequest
import me.meeshy.sdk.model.TrackingClickRequest
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkDetail
import me.meeshy.sdk.model.TrackingLinksPage
import me.meeshy.sdk.model.TrackingRedirectStatusRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Les routes d'un lien de suivi PAR JETON — résolution, clic, état de redirection, désactivation,
 * statistiques, par conversation, administration — en complément du [TrackingLinkApi] de la liste.
 * Port de `TrackingLinkService` et `TrackedLinkService` (TrackingLinksEndpoint.swift).
 */
interface TrackingLinkTokenApi {
    /** Détail d'un lien par son jeton (identité optionnelle). */
    @GET("tracking-links/{token}")
    suspend fun byToken(@Path("token") token: String): ApiResponse<TrackingLink>

    /** Active ou désactive un lien (`isActive`). */
    @PATCH("tracking-links/{token}")
    suspend fun setActive(
        @Path("token") token: String,
        @Body body: SetTrackingLinkActiveRequest,
    ): ApiResponse<TrackingLink>

    @DELETE("tracking-links/{token}")
    suspend fun delete(@Path("token") token: String): ApiResponse<Unit>

    /** Désactive un lien. */
    @PATCH("tracking-links/{token}/deactivate")
    suspend fun deactivate(@Path("token") token: String): ApiResponse<TrackingLink>

    /** Détail et clics d'un lien. */
    @GET("tracking-links/{token}/clicks")
    suspend fun clicks(
        @Path("token") token: String,
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
    ): ApiResponse<TrackingLinkDetail>

    /** Enregistre un clic ; au mieux, jamais bloquant pour la navigation. */
    @POST("tracking-links/{token}/click")
    suspend fun click(
        @Path("token") token: String,
        @Body body: TrackingClickRequest,
    ): ApiResponse<JsonElement>

    /** L'issue de la redirection (`confirmed` ou `failed`) — route publique. */
    @POST("tracking-links/{token}/redirect-status")
    suspend fun redirectStatus(
        @Path("token") token: String,
        @Body body: TrackingRedirectStatusRequest,
    ): ApiResponse<JsonElement>

    /** Résout un jeton en cible (identité optionnelle). */
    @GET("tracking-links/{token}/resolve")
    suspend fun resolve(@Path("token") token: String): ApiResponse<ResolvedTrackedLink>

    @GET("tracking-links/{token}/stats")
    suspend fun linkStats(@Path("token") token: String): ApiResponse<JsonElement>

    @GET("tracking-links/check-token/{token}")
    suspend fun checkToken(@Path("token") token: String): ApiResponse<JsonElement>

    @GET("tracking-links/conversation/{conversationId}")
    suspend fun byConversation(@Path("conversationId") conversationId: String): ApiResponse<TrackingLinksPage>

    @GET("tracking-links/admin/all")
    suspend fun adminAll(
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
    ): ApiResponse<TrackingLinksPage>

    @GET("tracking-links/admin/{token}/clicks")
    suspend fun adminClicks(
        @Path("token") token: String,
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
    ): ApiResponse<TrackingLinkDetail>
}
