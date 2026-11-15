package me.meeshy.sdk.model.call

/** Ce que décide [CallEndEmission.request] pour une demande de fin d'appel. */
sealed interface CallEndDecision {
    /** Demande sans effet : appel inconnu, ou fin déjà demandée (idempotence). */
    data object Ignore : CallEndDecision

    /** La fin part maintenant ; [reason] est déjà normalisée (ou absente). */
    data class Emit(val callId: String, val reason: String?) : CallEndDecision
}

/**
 * Les règles pures de l'émission de `call:end`, miroir de iOS `CallEndEmission` + `emitCallEndReliably` :
 *
 *  - la raison est reconnue ([normalizedReason]) : une raison hors schéma passerelle est retirée, la fin part quand même ;
 *  - idempotente : une seconde demande pour le même appel est sans effet (la fin ne repart pas deux fois) ;
 *  - rejouable : une fin que la passerelle n'a pas accusée, ou émise socket froide, est armée dans le
 *    [CallPendingEndLedger] et rendue UNE fois par [replayOnReconnect] ; le rejeu ne repasse pas par [request].
 */
data class CallEndEmission(
    private val requested: List<String> = emptyList(),
    val ledger: CallPendingEndLedger = CallPendingEndLedger(),
) {
    fun request(callId: String, reason: String?): Pair<CallEndDecision, CallEndEmission> {
        if (callId.isBlank() || callId in requested) return CallEndDecision.Ignore to this
        val next = copy(requested = (requested + callId).takeLast(CAPACITY))
        return CallEndDecision.Emit(callId, normalizedReason(reason)) to next
    }

    /** La passerelle n'a pas accusé la fin (ou la socket était froide) : elle sera rejouée à la reconnexion. */
    fun unacknowledged(callId: String, reason: String?): CallEndEmission =
        copy(ledger = ledger.arm(callId, normalizedReason(reason)))

    /** Toutes les fins à rejouer, dans l'ordre d'armement ; chacune n'est rendue qu'une fois. */
    fun replayOnReconnect(): Pair<List<CallPendingEnd>, CallEndEmission> {
        val (entries, rest) = ledger.drain()
        return entries to copy(ledger = rest)
    }

    companion object {
        const val CAPACITY: Int = 64
        const val REJECTED: String = "rejected"
        private val SCHEMA = Regex("^[a-z]+(_[a-z]+)*$")

        /** `socketEndCallSchema` : minuscules et underscores ; tout le reste est une raison inconnue, donc absente. */
        fun normalizedReason(raw: String?): String? = raw?.trim()?.takeIf { SCHEMA.matches(it) }
    }
}
