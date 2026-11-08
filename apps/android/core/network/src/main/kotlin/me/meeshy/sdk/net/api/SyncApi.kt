package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.sync.SyncResponse
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.conditionalApiCall
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query

/**
 * `GET /sync` — le delta unifié de la passerelle (`routes/sync/index.ts`). La route rend `Cache-Control:
 * no-store` et un `ETag` : le client porte la revalidation (`If-None-Match`), d'où la réponse brute, seule
 * à atteindre l'en-tête et à distinguer un 304 d'un 200. Passer par [syncConditionalResult].
 */
interface SyncApi {
    @GET("sync")
    suspend fun delta(
        @Query("since") since: String,
        @Query("collections") collections: String,
        @Query("scope") scope: String? = null,
        @Query("seq") seq: Long? = null,
        @Query("cursor") cursor: String? = null,
        @Query("fields") fields: String? = null,
        @Header("If-None-Match") ifNoneMatch: String? = null,
    ): Response<ApiResponse<SyncResponse>>
}

suspend fun SyncApi.syncConditionalResult(
    since: String,
    collections: String,
    scope: String?,
    seq: Long?,
    cursor: String?,
    fields: String?,
    ifNoneMatch: String?,
): ConditionalResult<SyncResponse> =
    conditionalApiCall { delta(since, collections, scope, seq, cursor, fields, ifNoneMatch) }
