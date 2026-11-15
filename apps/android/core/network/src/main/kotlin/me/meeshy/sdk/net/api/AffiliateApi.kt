package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityMini
import retrofit2.http.GET
import retrofit2.http.Query

/** Parrainage — port de `AffiliateService` (AffiliateEndpoint.swift). */
interface AffiliateApi {
    @GET("affiliate/tokens")
    suspend fun listTokens(
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
    ): ApiResponse<List<AffiliateToken>>

    @GET("affiliate/stats")
    suspend fun stats(): ApiResponse<AffiliateStats>
}

/** Communautés administrées, lues comme des liens de partage — port de `CommunityLinkService`. */
interface CommunityLinksApi {
    @GET("communities/mine")
    suspend fun mine(@Query("role") role: String): ApiResponse<List<CommunityMini>>
}
