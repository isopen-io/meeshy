package me.meeshy.sdk.outbox

import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.net.NetworkResult

/** Ce qu'un échec de livraison EST pour la file : à réessayer, perdu pour de bon, ou une limite du jour qui tient jusqu'à demain. */
internal sealed interface OutboxFailureClass {
    /** Réseau coupé, 5xx, 408, 429 de débit, 401 le temps d'un renouvellement de session : on réessaie. */
    data object Transient : OutboxFailureClass

    /** Un refus que la passerelle a DÉCIDÉ (400 / 403 / 404 / 422 portés par son enveloppe) : le rejouer renvoie le même refus. */
    data class Definitive(val status: Int, val code: String) : OutboxFailureClass

    /** `DAILY_COMMENT_LIMIT` / `DAILY_REACTION_LIMIT` : tient jusqu'à `resetAt`, un retrait ne rend pas la place du jour. */
    data class DailyLimit(val limit: DailyGestureLimit) : OutboxFailureClass
}

/**
 * Le classifieur UNIQUE des échecs de la file : chaque sender qui n'a pas de règle propre passe par lui au lieu de tout
 * traiter en échec transitoire (une ligne jouée éternellement bloque sa file). Le même statut SANS enveloppe de la
 * passerelle (code synthétique `HTTP_<n>` ou absent) ne vient pas d'elle — le 404 de Traefik pendant qu'elle redémarre en
 * est un — et reste transitoire : défaire le geste perdrait ce que le serveur aurait accepté.
 */
internal object OutboxResultClassifier {

    private val DEFINITIVE_STATUSES = setOf(400, 403, 404, 422)

    fun classify(failure: NetworkResult.Failure): OutboxFailureClass {
        val error = failure.error
        val status = error.httpStatus
        val code = error.code
        if (status == 429) {
            val limit = DailyGestureLimit.from(code, null, error.limit)
            return limit?.copy(resetAtEpochMillis = error.resetAtEpochMillis)?.let(OutboxFailureClass::DailyLimit)
                ?: OutboxFailureClass.Transient
        }
        return if (status in DEFINITIVE_STATUSES && code != null && code != "HTTP_$status") {
            OutboxFailureClass.Definitive(status!!, code)
        } else {
            OutboxFailureClass.Transient
        }
    }

    fun toSendResult(failure: NetworkResult.Failure): SendResult = when (val verdict = classify(failure)) {
        OutboxFailureClass.Transient -> SendResult.TransientFailure
        is OutboxFailureClass.Definitive -> SendResult.PermanentFailure("Refused: HTTP ${verdict.status} ${verdict.code}")
        is OutboxFailureClass.DailyLimit -> SendResult.PermanentFailure(verdict.limit.reason)
    }
}
