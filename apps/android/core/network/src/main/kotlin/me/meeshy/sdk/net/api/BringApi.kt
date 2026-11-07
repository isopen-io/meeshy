package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesBring
import retrofit2.http.DELETE
import retrofit2.http.Path

/** L'accusé de `DELETE /bring/:bringId` (`services/gateway/src/routes/bring/index.ts`). */
@Serializable
data class BringStopResponse(val bringId: String, val stopped: Boolean)

/**
 * Le Bring (#13936) — le contrat de `packages/shared/types/bring.ts`. Ce lot porte l'ARRÊT, par le destinataire, d'un
 * geste ; l'envoi (`GET|POST /bring/:userId`) arrive avec la fiche d'un ami.
 */
interface BringApi {
    /** Arrête un Bring : propagé par la passerelle à tous les appareils des deux. Un 404 dit « déjà arrêté ». */
    @DELETE(ApiRoutesBring.BY_BRING_ID)
    suspend fun stop(@Path("bringId") bringId: String): ApiResponse<BringStopResponse>
}

@Module
@InstallIn(SingletonComponent::class)
internal object BringRoutesModule {

    @Provides
    fun providesBringApi(api: MeeshyApi): BringApi = api.service(BringApi::class.java)
}
