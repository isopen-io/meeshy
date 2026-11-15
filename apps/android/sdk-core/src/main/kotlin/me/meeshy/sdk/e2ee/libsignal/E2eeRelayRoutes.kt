package me.meeshy.sdk.e2ee.libsignal

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Les routes de l'annuaire par appareil et du relais (`services/gateway/src/routes/e2ee.ts`, chemins de `ApiRoutesE2Ee`)
 * et l'envoi libsignal (`POST /conversations/:id/messages`). Corps BRUTS dans les deux sens : ils s'encodent et se
 * décodent par `E2eeJson` (aucune coercition — un `deviceId` coercé enverrait une enveloppe à un autre appareil), et un
 * refus garde son corps entier, dont l'écart Sesame du 409 (à la racine de l'enveloppe d'erreur).
 */
internal interface E2eeRelayRoutes {
    @POST("e2ee/devices")
    suspend fun enroll(@Body body: RequestBody): Response<ResponseBody>

    @PUT("e2ee/devices/{deviceId}/keys")
    suspend fun publishKeys(@Path("deviceId") deviceId: Int, @Body body: RequestBody): Response<ResponseBody>

    @GET("e2ee/devices/self/prekey-count")
    suspend fun preKeyStock(): Response<ResponseBody>

    @DELETE("e2ee/devices/{deviceId}")
    suspend fun retireDevice(@Path("deviceId") deviceId: Int, @Query("registrationId") registrationId: Int): Response<ResponseBody>

    @GET("e2ee/keys/{userId}")
    suspend fun bundles(@Path("userId") userId: String, @Query("deviceIds") deviceIds: String?): Response<ResponseBody>

    @GET("e2ee/keys/{userId}/devices")
    suspend fun devices(@Path("userId") userId: String): Response<ResponseBody>

    @GET("e2ee/envelopes")
    suspend fun envelopes(@Query("after") after: String?, @Query("limit") limit: Int?): Response<ResponseBody>

    @POST("e2ee/envelopes/ack")
    suspend fun acknowledge(@Body body: RequestBody): Response<ResponseBody>

    @POST("conversations/{cid}/messages")
    suspend fun sendLibsignal(@Path("cid") conversationId: String, @Body body: RequestBody): Response<ResponseBody>
}
