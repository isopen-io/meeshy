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
 * Un geste idempotent qui lit un 404 de la passerelle ou un 410 comme « déjà fait » (supprimer un commentaire, archiver une
 * conversation…) le décide dans son sender, avant ce classeur. Pas la suppression pour tous d'un message (`DELETE_MESSAGE`,
 * #19047) : le 404 que la passerelle y sert (`MESSAGE_NOT_FOUND`) est un refus définitif dont la raison garde le statut, et
 * [refusedAsGone] le relit quand la ligne s'épuise pour ne jamais faire revenir le message.
 */
public object SendFailureClassifier {

    public const val SESSION_EXPIRED_REASON: String = "session-expired"

    private val PERMANENT_STATUSES = setOf(400, 403, 404, 410, 413, 415, 422)

    /** The gateway's own word that the target is gone: unknown (404) or already removed (410). */
    private val GONE_STATUSES = setOf(404, 410)

    /** How a definitive refusal names its status in the reason it leaves ([refusedAsGone] reads it back). */
    private const val REFUSED_PREFIX = "Refused: HTTP "

    /** Refused for good wherever the answer comes from: a proxy that finds the body too large refuses it again. */
    private val PERMANENT_WHEREVER_ANSWERED = setOf(413, 415)
    private const val NETWORK_CODE = "NETWORK"

    public fun classify(error: ApiError): SendResult {
        val status = error.httpStatus
        return when {
            DailyGestureLimit.from(error.code, null) != null ->
                SendResult.PermanentFailure("$REFUSED_PREFIX${status ?: 429} ${error.code}")
            status == 401 -> SendResult.Deferred(SESSION_EXPIRED_REASON)
            status != null && status in PERMANENT_STATUSES && (status in PERMANENT_WHEREVER_ANSWERED || answeredByGateway(error, status)) ->
                SendResult.PermanentFailure("$REFUSED_PREFIX$status ${error.code.orEmpty()}".trim())
            status == null && error.code == NETWORK_CODE -> SendResult.TransportFailure
            else -> SendResult.TransientFailure
        }
    }

    /**
     * #19047 — whether a row was refused because the gateway itself said its target is gone (404, 410), read back from the
     * reason [classify] wrote: the only trace of the refusal an exhausted row keeps (`OutboxEntity.lastError`).
     */
    public fun refusedAsGone(reason: String?): Boolean {
        val status = reason?.takeIf { it.startsWith(REFUSED_PREFIX) }?.removePrefix(REFUSED_PREFIX)?.substringBefore(' ')
        return status?.toIntOrNull()?.let { it in GONE_STATUSES } == true
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
