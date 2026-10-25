package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Path

/**
 * Mes appareils de l'annuaire E2EE par appareil (`services/gateway/src/routes/e2ee.ts`, #13014) :
 * les lister, et en retirer un. Le retrait RÉVOQUE l'identité de l'appareil côté passerelle : il
 * ne reçoit plus aucune copie et ne se réenrôle pas avec la même identité.
 *
 * La `data` reste un OBJET brut : `MeeshyApi.json` coerce, et un `deviceId` coercé enverrait le
 * retrait sur un autre appareil. Le décodage strict est `OwnEncryptedDevicesDecoder`.
 */
interface E2eeDeviceApi {
    @GET("e2ee/devices")
    suspend fun ownDevices(): ApiResponse<JsonObject>

    @DELETE("e2ee/devices/{deviceId}")
    suspend fun retireDevice(@Path("deviceId") deviceId: Int): ApiResponse<JsonObject>
}
