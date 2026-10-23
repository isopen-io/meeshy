package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.IdentifierAvailability
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.ShareLinkArrivalStats
import me.meeshy.sdk.model.ShareLinkArrivalsPage
import me.meeshy.sdk.model.ShareLinkInfo
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Le détail d'un lien de partage — carte, messages, arrivées, statistiques, adhésion — en complément
 * du [LinkApi] de gestion. Port de `ShareLinkService` et `WorldService` (LinksEndpoint.swift).
 */
interface LinkDetailApi {
    /** Les liens de l'utilisateur, sans pagination (`GET /links/my-links`). */
    @GET("links/my-links")
    suspend fun myLinks(): ApiResponse<List<MyShareLink>>

    /** Disponibilité d'un identifiant de lien. */
    @GET("links/check-identifier/{identifier}")
    suspend fun checkIdentifier(@Path("identifier") identifier: String): ApiResponse<IdentifierAvailability>

    /** Visites et arrivées d'UN lien. */
    @GET("links/{linkId}/stats")
    suspend fun linkStats(@Path("linkId") linkId: String): ApiResponse<ShareLinkArrivalStats>

    /** Une page des arrivées d'UN lien ; `cursor` est celui de la page précédente, jamais fabriqué. */
    @GET("links/{linkId}/arrivals")
    suspend fun arrivals(
        @Path("linkId") linkId: String,
        @Query("limit") limit: Int,
        @Query("cursor") cursor: String? = null,
    ): ApiResponse<ShareLinkArrivalsPage>

    /** Détail public d'un lien (identité optionnelle). */
    @GET("links/{identifier}")
    suspend fun info(@Path("identifier") identifier: String): ApiResponse<ShareLinkInfo>

    /** La carte d'un lien : aperçu de la conversation (identité optionnelle). */
    @GET("links/{identifier}/card")
    suspend fun card(@Path("identifier") identifier: String): ApiResponse<JsonElement>

    /** Les messages visibles par le lien (identité optionnelle). */
    @GET("links/{identifier}/messages")
    suspend fun messages(
        @Path("identifier") identifier: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<JsonElement>

    /** Poste un message par le lien — route publique, le jeton de session invité authentifie. */
    @POST("links/{identifier}/messages")
    suspend fun postMessage(
        @Path("identifier") identifier: String,
        @Body body: JsonObject,
    ): ApiResponse<JsonElement>

    /** Rejoindre la conversation d'un lien par sa clé (identité optionnelle). */
    @POST("links/{key}/members")
    suspend fun join(
        @Path("key") key: String,
        @Body body: JsonObject,
    ): ApiResponse<JsonElement>

    /** Métadonnées Open Graph (HTML) du lien. */
    @GET("links/{identifier}/og")
    suspend fun openGraph(@Path("identifier") identifier: String): Response<ResponseBody>
}
