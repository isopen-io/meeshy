package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.contacts.ContactMatchRequest
import me.meeshy.sdk.model.contacts.ContactMatchResponse
import retrofit2.http.Body
import retrofit2.http.POST

/** Rapprochement ephemere du carnet (port de `ContactMatchService`) : rien n'est conserve cote serveur. */
interface ContactMatchApi {
    @POST("users/me/contacts/match")
    suspend fun match(@Body body: ContactMatchRequest): ApiResponse<ContactMatchResponse>
}
