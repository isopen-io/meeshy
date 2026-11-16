package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.battery.BatteryEmitterSettings
import me.meeshy.sdk.model.battery.BatteryPersonSettingsBody
import me.meeshy.sdk.model.battery.BatteryPersonSettingsWire
import me.meeshy.sdk.model.battery.BatteryPullResultWire
import me.meeshy.sdk.model.battery.BatteryReportBody
import me.meeshy.sdk.model.battery.BatteryReportResultWire
import me.meeshy.sdk.model.battery.BatterySnapshotWire
import me.meeshy.sdk.model.battery.BatteryStateResponseWire
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesMe
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * La batterie des Proches et des Sangs (#14147) — les routes REST du contrat (`routes/me/device-battery.ts`,
 * `routes/relations/battery.ts`), adressées par les registres GÉNÉRÉS [ApiRoutesMe] / [ApiRoutesRelations].
 */
interface BatteryApi {
    /** Mon relevé (téléphone suivi seulement) — la même porte que `battery:report`. */
    @POST(ApiRoutesMe.DEVICE_BATTERY)
    suspend fun report(@Body body: BatteryReportBody): ApiResponse<BatteryReportResultWire>

    /** Partager ma batterie, pour tous. */
    @GET(ApiRoutesMe.DEVICE_BATTERY_SETTINGS)
    suspend fun emitterSettings(): ApiResponse<BatteryEmitterSettings>

    @PUT(ApiRoutesMe.DEVICE_BATTERY_SETTINGS)
    suspend fun setEmitterSettings(@Body body: BatteryEmitterSettings): ApiResponse<BatteryEmitterSettings>

    /** Le rattrapage : les épisodes en cours qu'on me sert. */
    @GET(ApiRoutesRelations.BATTERY)
    suspend fun snapshot(): ApiResponse<BatterySnapshotWire>

    /** L'état d'une personne, tel qu'on me le sert (`state` nul hors épisode). */
    @GET(ApiRoutesRelations.BY_USER_ID_BATTERY)
    suspend fun stateOf(@Path("userId") userId: String): ApiResponse<BatteryStateResponseWire>

    /** Demander un relevé maintenant (Sang, une fois toutes les 5 min par paire). */
    @POST(ApiRoutesRelations.BY_USER_ID_BATTERY_PULL)
    suspend fun pull(@Path("userId") userId: String): ApiResponse<BatteryPullResultWire>

    /** Ce que je partage à cette personne, ce que je reçois d'elle. */
    @GET(ApiRoutesRelations.BY_USER_ID_BATTERY_SETTINGS)
    suspend fun personSettings(@Path("userId") userId: String): ApiResponse<BatteryPersonSettingsWire>

    @PUT(ApiRoutesRelations.BY_USER_ID_BATTERY_SETTINGS)
    suspend fun setPersonSettings(
        @Path("userId") userId: String,
        @Body body: BatteryPersonSettingsBody,
    ): ApiResponse<BatteryPersonSettingsWire>
}

/** L'interface REST de la batterie ([BatteryApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object BatteryRoutesModule {
    @Provides
    fun providesBatteryApi(api: MeeshyApi): BatteryApi = api.service(BatteryApi::class.java)
}
