package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.inactivity.InactivityPersonSettingsBody
import me.meeshy.sdk.model.inactivity.InactivityPersonSettingsWire
import me.meeshy.sdk.model.inactivity.InactivitySnapshotWire
import me.meeshy.sdk.model.inactivity.WellnessOkResultWire
import me.meeshy.sdk.model.inactivity.WellnessSettingsWire
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesMe
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * La vérification d'inactivité (#18738) — les routes REST du contrat (`routes/me/wellness.ts`,
 * `routes/relations/inactivity.ts`), adressées par les registres GÉNÉRÉS [ApiRoutesMe] / [ApiRoutesRelations].
 */
interface InactivityApi {
    /** « Je vais bien » : la réponse à « Tout va bien ? », sans corps. */
    @POST(ApiRoutesMe.WELLNESS_OK)
    suspend fun wellnessOk(): ApiResponse<WellnessOkResultWire>

    /** Le délai sans activité (6, 12, 24 h) ou la coupure pour tous. */
    @GET(ApiRoutesMe.WELLNESS_SETTINGS)
    suspend fun wellnessSettings(): ApiResponse<WellnessSettingsWire>

    /** Le corps est [me.meeshy.sdk.model.inactivity.WellnessSettingsBody] : la coupure part en `null` explicite. */
    @PUT(ApiRoutesMe.WELLNESS_SETTINGS)
    suspend fun setWellnessSettings(@Body body: JsonObject): ApiResponse<WellnessSettingsWire>

    /** Le rattrapage à la connexion : les alertes d'inactivité qu'on me sert. */
    @GET(ApiRoutesRelations.INACTIVITY)
    suspend fun snapshot(): ApiResponse<InactivitySnapshotWire>

    /** Ce que je partage à cette personne. */
    @GET(ApiRoutesRelations.BY_USER_ID_INACTIVITY_SETTINGS)
    suspend fun personSettings(@Path("userId") userId: String): ApiResponse<InactivityPersonSettingsWire>

    @PUT(ApiRoutesRelations.BY_USER_ID_INACTIVITY_SETTINGS)
    suspend fun setPersonSettings(
        @Path("userId") userId: String,
        @Body body: InactivityPersonSettingsBody,
    ): ApiResponse<InactivityPersonSettingsWire>
}

/** L'interface REST de la vérification d'inactivité ([InactivityApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object InactivityRoutesModule {
    @Provides
    fun providesInactivityApi(api: MeeshyApi): InactivityApi = api.service(InactivityApi::class.java)
}
