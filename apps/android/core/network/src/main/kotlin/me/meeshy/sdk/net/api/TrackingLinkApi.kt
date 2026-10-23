package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.CreatedTrackingLinkPayload
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingLinksPage
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/** Liens de suivi de l'utilisateur — port de `TrackingLinkService` (TrackingLinksEndpoint.swift). */
interface TrackingLinkApi {
    @GET("tracking-links/user/me")
    suspend fun listMine(
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
    ): ApiResponse<TrackingLinksPage>

    @GET("tracking-links/stats")
    suspend fun stats(): ApiResponse<TrackingLinkStats>

    @POST("tracking-links")
    suspend fun create(@Body body: CreateTrackingLinkRequest): ApiResponse<CreatedTrackingLinkPayload>
}
