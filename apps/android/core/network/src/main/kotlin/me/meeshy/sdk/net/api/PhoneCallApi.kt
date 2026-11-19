package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.phonecall.PhoneCallAckWire
import me.meeshy.sdk.model.phonecall.PhoneCallEmitterSettingsBody
import me.meeshy.sdk.model.phonecall.PhoneCallEmitterSettingsWire
import me.meeshy.sdk.model.phonecall.PhoneCallPersonSettingsBody
import me.meeshy.sdk.model.phonecall.PhoneCallPersonSettingsWire
import me.meeshy.sdk.model.phonecall.PhoneCallReportBody
import me.meeshy.sdk.model.phonecall.PhoneCallSnapshotWire
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesMe
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * « En appel » (#18753) — les routes REST du contrat (`routes/me/device-call.ts`, `routes/relations/phone-call.ts`),
 * adressées par les registres GÉNÉRÉS [ApiRoutesMe] / [ApiRoutesRelations].
 */
interface PhoneCallApi {
    /** Le rapport du téléphone suivi : un booléen, et rien d'autre. */
    @POST(ApiRoutesMe.DEVICE_CALL)
    suspend fun report(@Body body: PhoneCallReportBody): ApiResponse<PhoneCallAckWire>

    /** « Montrer à mes Sangs que je suis en appel », pour tous. */
    @GET(ApiRoutesMe.DEVICE_CALL_SETTINGS)
    suspend fun emitterSettings(): ApiResponse<PhoneCallEmitterSettingsWire>

    @PUT(ApiRoutesMe.DEVICE_CALL_SETTINGS)
    suspend fun setEmitterSettings(@Body body: PhoneCallEmitterSettingsBody): ApiResponse<PhoneCallEmitterSettingsWire>

    /** Le rattrapage à la connexion : les états « en appel » qu'on me sert. */
    @GET(ApiRoutesRelations.PHONE_CALLS)
    suspend fun snapshot(): ApiResponse<PhoneCallSnapshotWire>

    /** Ce que je partage à cette personne. */
    @GET(ApiRoutesRelations.BY_USER_ID_PHONE_CALL_SETTINGS)
    suspend fun personSettings(@Path("userId") userId: String): ApiResponse<PhoneCallPersonSettingsWire>

    @PUT(ApiRoutesRelations.BY_USER_ID_PHONE_CALL_SETTINGS)
    suspend fun setPersonSettings(
        @Path("userId") userId: String,
        @Body body: PhoneCallPersonSettingsBody,
    ): ApiResponse<PhoneCallPersonSettingsWire>
}

/** L'interface REST d'« en appel » ([PhoneCallApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object PhoneCallRoutesModule {
    @Provides
    fun providesPhoneCallApi(api: MeeshyApi): PhoneCallApi = api.service(PhoneCallApi::class.java)
}
