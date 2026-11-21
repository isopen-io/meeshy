package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.fall.FallPersonSettingsBody
import me.meeshy.sdk.model.fall.FallPersonSettingsWire
import me.meeshy.sdk.model.fall.FallSnapshotWire
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesRelations
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * La chute détectée (#18748) — les routes REST que le LECTEUR Android appelle (`routes/relations/fall.ts`), adressées
 * par le registre GÉNÉRÉ [ApiRoutesRelations]. Android ne détecte rien : ni `POST /me/health/fall`, ni accord ici.
 */
interface FallApi {
    /** Le rattrapage à la connexion : les chutes en cours qu'on me sert. */
    @GET(ApiRoutesRelations.FALLS)
    suspend fun snapshot(): ApiResponse<FallSnapshotWire>

    /** Ce que je partage à cette personne, si ma montre détecte une chute. */
    @GET(ApiRoutesRelations.BY_USER_ID_FALL_SETTINGS)
    suspend fun personSettings(@Path("userId") userId: String): ApiResponse<FallPersonSettingsWire>

    @PUT(ApiRoutesRelations.BY_USER_ID_FALL_SETTINGS)
    suspend fun setPersonSettings(
        @Path("userId") userId: String,
        @Body body: FallPersonSettingsBody,
    ): ApiResponse<FallPersonSettingsWire>
}

@Module
@InstallIn(SingletonComponent::class)
internal object FallRoutesModule {
    @Provides
    fun providesFallApi(api: MeeshyApi): FallApi = api.service(FallApi::class.java)
}
