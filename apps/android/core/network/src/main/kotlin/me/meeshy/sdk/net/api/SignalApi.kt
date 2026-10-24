package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.model.signal.EstablishSessionResult
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.model.signal.SignalPreKeyUploadResult
import me.meeshy.sdk.net.NeverRetried
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Le protocole Signal côté passerelle — `services/gateway/src/routes/signal-protocol.ts`.
 * Port de `SignalEndpoint` (iOS) : publier son paquet de pré-clés, lire celui d'un
 * autre, établir une session.
 *
 * **Jamais réessayée** ([NeverRetried]) : ces routes ont un limiteur de débit
 * serré (5 à 30 requêtes par minute) pour empêcher le raclage de clés et
 * l'épuisement des pré-clés à usage unique, et une session qu'un rejeu ferait
 * établir deux fois consomme une pré-clé de plus. Un 503 `E2EE_UNAVAILABLE` est
 * le serveur qui REFUSE de simuler une session chiffrée : le rejouer ne la
 * rendra pas réelle.
 *
 * **Fail-closed.** Un échec ici ne laisse JAMAIS une conversation chiffrée partir
 * en clair : l'appelant passe par [me.meeshy.sdk.model.signal.EncryptedSendGate],
 * qui bloque l'envoi quelle que soit la cause. Cette interface ne convertit aucun
 * échec en succès et n'offre aucun repli.
 */
@NeverRetried
interface SignalApi {
    /** Publie le paquet de pré-clés de CET appareil (parties publiques seulement). */
    @POST("signal/keys")
    suspend fun uploadKeys(@Body bundle: SignalPreKeyBundle): ApiResponse<SignalPreKeyUploadResult>

    /**
     * Lit le paquet d'un autre utilisateur. 403 sans conversation ni amitié en
     * commun ; 404 s'il n'a jamais publié de clés.
     */
    @GET("signal/keys/{userId}")
    suspend fun keysFor(@Path("userId") userId: String): ApiResponse<SignalPreKeyBundle>

    /** Établit une session avec [EstablishSessionRequest.recipientUserId] dans une conversation. */
    @POST("signal/session/establish")
    suspend fun establishSession(@Body body: EstablishSessionRequest): ApiResponse<EstablishSessionResult>

    /**
     * Variantes à `data` BRUTE (objet JSON) : `MeeshyApi.json` coerce (`coerceInputValues`), et un champ
     * de sécurité coercé est une rétrogradation silencieuse. L'appelant décode ensuite STRICTEMENT
     * (`SignalWireDecoder`). Les chemins sont ceux des trois méthodes ci-dessus.
     */
    @POST("signal/keys")
    suspend fun uploadKeysObject(@Body bundle: SignalPreKeyBundle): ApiResponse<JsonObject>

    @GET("signal/keys/{userId}")
    suspend fun keysForObject(@Path("userId") userId: String): ApiResponse<JsonObject>

    @POST("signal/session/establish")
    suspend fun establishSessionObject(@Body body: EstablishSessionRequest): ApiResponse<JsonObject>
}
