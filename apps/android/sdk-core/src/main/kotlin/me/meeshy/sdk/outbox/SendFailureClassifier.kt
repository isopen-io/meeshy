package me.meeshy.sdk.outbox

import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.net.ApiError
import java.io.IOException

/**
 * Classe un échec d'envoi en [SendResult] (miroir de `OutboxFlusher.isPermanentServerRejection`,
 * `isSessionExpiry` et `isNetworkTransportError` côté iOS) :
 *
 * - 400 / 403 / 404 / 410 / 413 / 415 / 422, la limite quotidienne de gestes : [SendResult.PermanentFailure] dès le premier essai ;
 * - 401 : [SendResult.Deferred], la session se renouvelle, aucun essai n'est compté ;
 * - IOException de transport (connexion, DNS, délai, itinérance) : [SendResult.TransportFailure], aucun essai compté ;
 * - 408 / 429 / 503 / 5xx / 409 et le reste : [SendResult.TransientFailure], budget de [OutboxRepository.MAX_ATTEMPTS].
 *
 * Un 404 sur une suppression (= déjà supprimé) et un 410 (= déjà appliqué) restent des succès : c'est le sender qui les lit,
 * avant d'appeler ce classeur.
 */
public object SendFailureClassifier {

    public const val SESSION_EXPIRED_REASON: String = "session-expired"

    private val PERMANENT_STATUSES = setOf(400, 403, 404, 410, 413, 415, 422)

    /** Refused for good wherever the answer comes from: a proxy that finds the body too large refuses it again. */
    private val PERMANENT_WHEREVER_ANSWERED = setOf(413, 415)
    private const val NETWORK_CODE = "NETWORK"

    public fun classify(error: ApiError): SendResult {
        val status = error.httpStatus
        return when {
            DailyGestureLimit.from(error.code, null) != null ->
                SendResult.PermanentFailure("Refused: HTTP ${status ?: 429} ${error.code}")
            status == 401 -> SendResult.Deferred(SESSION_EXPIRED_REASON)
            status != null && status in PERMANENT_STATUSES && (status in PERMANENT_WHEREVER_ANSWERED || answeredByGateway(error, status)) ->
                SendResult.PermanentFailure("Refused: HTTP $status ${error.code.orEmpty()}".trim())
            status == null && error.code == NETWORK_CODE -> SendResult.TransportFailure
            else -> SendResult.TransientFailure
        }
    }

    public fun classify(failure: Throwable): SendResult = when (failure) {
        is IOException -> SendResult.TransportFailure
        else -> SendResult.TransientFailure
    }

    /**
     * Le même statut sans enveloppe de la passerelle (code synthétique `HTTP_<n>`) ne vient pas d'elle : le 404 de Traefik pendant
     * qu'elle redémarre en est un, et l'épuiser perdrait un geste que le serveur aurait accepté.
     */
    private fun answeredByGateway(error: ApiError, status: Int): Boolean = error.code != "HTTP_$status"
}
