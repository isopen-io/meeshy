package me.meeshy.sdk.model.call

/** La fin d'un appel à rejouer : `reason == "rejected"` marque un REFUS, que le rejeu doit préserver. */
data class CallPendingEnd(val callId: String, val reason: String?)

/**
 * Le registre, pur et immuable, des `call:end` / `call:reject` émis pendant une coupure (iOS
 * `pendingEndReconciliations` + `endReconciliationArmings`). Un raccroché que la passerelle n'a jamais reçu laisse
 * le pair dans un appel zombie jusqu'à ses propres garde-fous : la fin est donc rejouée à la reconnexion — la
 * passerelle est idempotente sur `call:end`.
 *
 *  - une entrée PAR appel (réarmer un appel remplace son entrée sans toucher celle des autres) ;
 *  - FIFO : le rejeu respecte l'ordre d'armement ;
 *  - un refus n'est jamais rétrogradé en fin plate (le mauvais libellé « manqué » reviendrait) ;
 *  - chaque appel ne s'arme que [MAX_ARMINGS] fois : une fin que la passerelle refuse (appel déjà clos) ne se
 *    réarme pas à chaque reconnexion pour toute la vie du processus ;
 *  - le tout est borné à [CAPACITY] appels, le plus ancien sortant le premier.
 */
data class CallPendingEndLedger(
    val pending: List<CallPendingEnd> = emptyList(),
    private val armings: List<Pair<String, Int>> = emptyList(),
) {
    /** Arme (ou réarme) la fin de [callId]. Au-delà de [MAX_ARMINGS] armements, la fin est abandonnée. */
    fun arm(callId: String, reason: String?): CallPendingEndLedger {
        if (callId.isBlank()) return this
        val previous = pending.firstOrNull { it.callId == callId }
        val others = pending.filterNot { it.callId == callId }
        val count = (armings.firstOrNull { it.first == callId }?.second ?: 0) + 1
        val counted = (armings.filterNot { it.first == callId } + (callId to count)).takeLast(CAPACITY)
        if (count > MAX_ARMINGS) return copy(pending = others, armings = counted)
        val kept = reason ?: previous?.reason
        return copy(pending = (others + CallPendingEnd(callId, kept)).takeLast(CAPACITY), armings = counted)
    }

    /** Toutes les fins en attente, dans l'ordre d'armement, et le registre vidé (les compteurs restent). */
    fun drain(): Pair<List<CallPendingEnd>, CallPendingEndLedger> = pending to copy(pending = emptyList())

    val isEmpty: Boolean get() = pending.isEmpty()

    companion object {
        const val MAX_ARMINGS: Int = 4
        const val CAPACITY: Int = 64
    }
}
