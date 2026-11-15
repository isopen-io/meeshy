package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.contacts.DirectoryContact
import me.meeshy.sdk.model.contacts.DirectorySyncRequest
import me.meeshy.sdk.model.contacts.DirectorySyncResult
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Repertoire (carnet synchronise) — port de `ContactDirectoryService`, iOS.
 *
 * Le MODE est porte par le VERBE (#4163) : `PUT` remplace (purge ce que la charge ne contient
 * pas), `PATCH` fusionne et ne purge jamais. Le corps ne le porte pas ([DirectorySyncRequest.mode]
 * est `@Transient`) : deux requetes dont l'une PURGE ne doivent pas se ressembler.
 *
 * Les corps contiennent un carnet d'adresses : `SensitiveBodyLoggingGuard` les couvre.
 */
interface ContactDirectoryApi {
    @PUT("directory/contacts")
    suspend fun replace(@Body body: DirectorySyncRequest): ApiResponse<DirectorySyncResult>

    @PATCH("directory/contacts")
    suspend fun merge(@Body body: DirectorySyncRequest): ApiResponse<DirectorySyncResult>

    /** Une page par CURSEUR (la route refuse `limit` > 100) ; `updatedSince` = delta depuis `appliedAt`. */
    @GET("directory/contacts")
    suspend fun page(
        @Query("limit") limit: Int,
        @Query("filter") filter: String = "all",
        @Query("cursor") cursor: String? = null,
        @Query("q") query: String? = null,
        @Query("updatedSince") updatedSince: String? = null,
    ): ApiResponse<List<DirectoryContact>>
}
