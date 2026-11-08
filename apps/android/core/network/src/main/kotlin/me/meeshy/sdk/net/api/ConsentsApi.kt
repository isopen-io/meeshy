package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.voice.ConsentEntry
import me.meeshy.sdk.model.voice.ConsentUpdateRequest
import me.meeshy.sdk.model.voice.ConsentsSnapshot
import me.meeshy.sdk.net.routes.ApiRoutesMe
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path

/** `GET /me/consents` et `PUT /me/consents/{purpose}` — l'adresse canonique des consentements confirmés (#6624). */
interface ConsentsApi {
    @GET(ApiRoutesMe.CONSENTS)
    suspend fun consents(): ApiResponse<ConsentsSnapshot>

    @PUT(ApiRoutesMe.CONSENTS_BY_PURPOSE)
    suspend fun setConsent(
        @Path("purpose") purpose: String,
        @Body body: ConsentUpdateRequest,
    ): ApiResponse<ConsentEntry>
}
