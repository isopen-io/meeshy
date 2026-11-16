package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.phonereachability.PhoneAliveResultWire
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEmitterSettings
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonSettingsBody
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonSettingsWire
import me.meeshy.sdk.model.phonereachability.PhoneReachabilitySnapshotWire
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityStateResponseWire
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesMe
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * Le téléphone injoignable (#18737) — les routes REST du contrat (`routes/me/device-reachability.ts`,
 * `routes/relations/phone-reachability.ts`), adressées par les registres GÉNÉRÉS [ApiRoutesMe] / [ApiRoutesRelations].
 */
interface PhoneReachabilityApi {
    /** La réponse du téléphone à une sonde silencieuse (`device_probe`) : un signe de vie, sans corps. */
    @POST(ApiRoutesMe.DEVICE_ALIVE)
    suspend fun alive(): ApiResponse<PhoneAliveResultWire>

    /** Prévenir mes Proches si mon téléphone est injoignable, pour tous. */
    @GET(ApiRoutesMe.DEVICE_REACHABILITY_SETTINGS)
    suspend fun emitterSettings(): ApiResponse<PhoneReachabilityEmitterSettings>

    @PUT(ApiRoutesMe.DEVICE_REACHABILITY_SETTINGS)
    suspend fun setEmitterSettings(@Body body: PhoneReachabilityEmitterSettings): ApiResponse<PhoneReachabilityEmitterSettings>

    /** Le rattrapage à la connexion : les téléphones injoignables qu'on me sert. */
    @GET(ApiRoutesRelations.PHONE_REACHABILITY)
    suspend fun snapshot(): ApiResponse<PhoneReachabilitySnapshotWire>

    /** L'état d'une personne, tel qu'on me le sert (`state` nul quand son téléphone répond). */
    @GET(ApiRoutesRelations.BY_USER_ID_PHONE_REACHABILITY)
    suspend fun stateOf(@Path("userId") userId: String): ApiResponse<PhoneReachabilityStateResponseWire>

    /** Ce que je partage à cette personne. */
    @GET(ApiRoutesRelations.BY_USER_ID_PHONE_REACHABILITY_SETTINGS)
    suspend fun personSettings(@Path("userId") userId: String): ApiResponse<PhoneReachabilityPersonSettingsWire>

    @PUT(ApiRoutesRelations.BY_USER_ID_PHONE_REACHABILITY_SETTINGS)
    suspend fun setPersonSettings(
        @Path("userId") userId: String,
        @Body body: PhoneReachabilityPersonSettingsBody,
    ): ApiResponse<PhoneReachabilityPersonSettingsWire>
}

/** L'interface REST du téléphone injoignable ([PhoneReachabilityApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object PhoneReachabilityRoutesModule {
    @Provides
    fun providesPhoneReachabilityApi(api: MeeshyApi): PhoneReachabilityApi = api.service(PhoneReachabilityApi::class.java)
}
