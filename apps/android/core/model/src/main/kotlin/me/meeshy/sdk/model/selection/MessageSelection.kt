package me.meeshy.sdk.model.selection

import me.meeshy.sdk.model.reading.mode.ConversationReadingMode

/**
 * Le mode sélection multiple du fil (#13294) — miroir de `ConversationOverlayState`
 * (`isSelectionModeActive` / `selectedMessageIds` / `selectionCap`) et des gestes de
 * `ConversationView+Selection` (iOS). Valeur immuable : chaque geste en rend une nouvelle.
 *
 * Le mode reste ouvert quand on décoche le dernier message (iOS) : on en sort par Annuler ou le
 * retour système, jamais par un décochage.
 */
data class MessageSelection(
    val isActive: Boolean = false,
    val ids: Set<String> = emptySet(),
) {

    /** Le verdict d'une bascule : la nouvelle sélection, le plafond atteint, ou rien à faire. */
    sealed interface Toggle {
        data class Changed(val selection: MessageSelection) : Toggle
        /** Le 101ᵉ message : refusé et signalé (haptique d'erreur + toast), jamais un dépassement silencieux. */
        data object CapReached : Toggle
        /** Hors du mode : la bascule n'a pas de sens. */
        data object Ignored : Toggle
    }

    /** Bascule UN message, plafonné à [CAP]. */
    fun toggle(messageId: String): Toggle = when {
        !isActive -> Toggle.Ignored
        messageId in ids -> Toggle.Changed(copy(ids = ids - messageId))
        ids.size >= CAP -> Toggle.CapReached
        else -> Toggle.Changed(copy(ids = ids + messageId))
    }

    /** Quitte le mode : la sélection ne lui survit jamais. */
    fun end(): MessageSelection = Inactive

    /** La sélection dans l'ORDRE du fil — un transfert groupé garde l'ordre de lecture. */
    fun inThreadOrder(threadIds: List<String>): List<String> = threadIds.filter { it in ids }

    /** Un message supprimé ou masqué ne reste pas coché : seuls les ids encore présents survivent. */
    fun retaining(presentIds: Set<String>): MessageSelection =
        if (!isActive || ids.all { it in presentIds }) this else copy(ids = ids.filterTo(HashSet()) { it in presentIds })

    companion object {
        /** « Maximum 100 messages » (iOS, 2026-08-27). */
        const val CAP = 100

        val Inactive = MessageSelection()

        /** Entre dans le mode en semant le premier message tapé — point d'entrée unique. */
        fun begin(seedMessageId: String) = MessageSelection(isActive = true, ids = setOf(seedMessageId))
    }
}

/**
 * **Un lecteur sans interface de sélection rend la main au Script** (iOS `ConversationSelectionHost`,
 * #11224) : la Rivière et le Résumé n'ont ni coche ni toucher de sélection, et la barre
 * s'ouvrirait derrière eux sur des messages qu'on ne voit pas.
 */
object MessageSelectionHost {
    fun landing(from: ConversationReadingMode): ConversationReadingMode? =
        when (from) {
            ConversationReadingMode.RIVER,
            ConversationReadingMode.SUMMARY,
            -> ConversationReadingMode.SCRIPT
            else -> null
        }
}
