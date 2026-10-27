package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.world.LinkMembershipRequest
import me.meeshy.sdk.model.world.LinkMembershipResponse
import me.meeshy.sdk.model.world.WorldEntry
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Où entre le monde entier (miroir de `WorldService`, iOS) : l'entrée World Wide servie par `GET /world`
 * — publique, sans identité — puis la porte canonique des liens (`POST /links/:key/members`), par laquelle
 * un INVITÉ entre avec son nom et sa langue. La clé de jonction se LIT dans l'entrée servie.
 */
interface WorldApi {
    @GET("world")
    suspend fun entry(): ApiResponse<WorldEntry>

    @POST("links/{key}/members")
    suspend fun joinAsGuest(
        @Path("key") key: String,
        @Body body: LinkMembershipRequest,
    ): ApiResponse<LinkMembershipResponse>
}
