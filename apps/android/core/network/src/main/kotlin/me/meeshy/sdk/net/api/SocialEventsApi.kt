package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SocialEventsReceipt
import me.meeshy.sdk.model.analytics.SocialEventsBody
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * `POST /social/events` : la porte unique de la télémétrie de lecture (vues, impressions,
 * ouvertures, sessions de consommation). Un compte s'annonce par son JWT ; un lecteur sans compte
 * présente `X-Session-Token`.
 */
interface SocialEventsApi {
    @POST("social/events")
    suspend fun record(
        @Body body: SocialEventsBody,
        @Header("X-Session-Token") sessionToken: String? = null,
    ): ApiResponse<SocialEventsReceipt>
}
