package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.AffiliateRegisterRequest
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.AffiliateTrackVisitRequest
import me.meeshy.sdk.model.AffiliateTrackVisitResult
import me.meeshy.sdk.model.AffiliateValidation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateAffiliateTokenRequest
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Le parrainage hors liste : création et retrait d'un jeton, rattachement d'un filleul (authentifiés),
 * puis les quatre routes PUBLIQUES (clic, visite, validation, Open Graph) servies sans bearer par
 * `EndpointPolicy`. Complète l'[AffiliateApi] de lecture — port d'`AffiliateService` (AffiliateEndpoint.swift).
 */
interface AffiliateReferralApi {
    @POST("affiliate/tokens")
    suspend fun createToken(@Body body: CreateAffiliateTokenRequest): ApiResponse<AffiliateToken>

    @DELETE("affiliate/tokens/{id}")
    suspend fun deleteToken(@Path("id") id: String): ApiResponse<Unit>

    /** Rattache un filleul au parrain — authentifié. */
    @POST("affiliate/register")
    suspend fun register(@Body body: AffiliateRegisterRequest): ApiResponse<JsonElement>

    // Routes PUBLIQUES (aucun bearer : EndpointPolicy) : click, track-visit, validate, og.

    @POST("affiliate/click/{token}")
    suspend fun click(@Path("token") token: String): ApiResponse<JsonElement>

    @POST("affiliate/track-visit")
    suspend fun trackVisit(@Body body: AffiliateTrackVisitRequest): ApiResponse<AffiliateTrackVisitResult>

    @GET("affiliate/validate/{token}")
    suspend fun validate(@Path("token") token: String): ApiResponse<AffiliateValidation>

    @GET("affiliate/{token}/og")
    suspend fun openGraph(@Path("token") token: String): Response<ResponseBody>
}

/** Communautés administrées, lues comme des liens de partage — port de `CommunityLinkService`. */
interface CommunityLinksApi {
    @GET("communities/mine")
    suspend fun mine(@Query("role") role: String): ApiResponse<List<CommunityMini>>
}
