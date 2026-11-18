package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.profile.MyAddressesPayload
import me.meeshy.sdk.net.routes.ApiRoutesUsers
import retrofit2.http.GET

/** « Mes adresses » (#18863) : ce que le propriétaire déclare sur sa fiche, lu pour la face Liens. */
interface MyAddressesApi {
    @GET(ApiRoutesUsers.ME_ADDRESSES)
    suspend fun list(): ApiResponse<MyAddressesPayload>
}
