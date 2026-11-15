package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesBring
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** L'accusé de `DELETE /bring/:bringId` (`services/gateway/src/routes/bring/index.ts`). */
@Serializable
data class BringStopResponse(val bringId: String, val stopped: Boolean)

/**
 * Le Bring (#13936) — le contrat de `packages/shared/types/bring.ts` : l'ARRÊT d'un geste (destinataire ou expéditeur),
 * et l'envoi depuis la fiche d'un ami (#16617).
 */
interface BringApi {
    /** Le bouton existe-t-il, et combien en reste-t-il aujourd'hui ? `available: false` ⇒ la ligne disparaît. */
    @GET(ApiRoutesBring.BY_USER_ID)
    suspend fun availability(@Path("userId") userId: String): ApiResponse<BringAvailability>

    /** Faire sonner : 403 (sous Ami, blocage, service coupé), 429 (quota du jour), 503 (compteur injoignable). */
    @POST(ApiRoutesBring.BY_USER_ID)
    suspend fun send(@Path("userId") userId: String): ApiResponse<BringSent>

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
