package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw

/**
 * Le dépliage d'un long message dans le fil (iOS `LongMessageExpansionLaw`, miroir de la loi de
 * `:core:model`) : un SEUL message déplié à la fois, et une fenêtre de maintien de 0,65 s qui
 * garde les autres rangées atténuées le temps que la hauteur s'anime (0,3 s) — sans elle, les
 * voisines reviendraient à pleine opacité avant la fin du repli.
 */
@Immutable
internal data class LongMessageExpansionState(
    val expandedId: String? = null,
    /** Horloge (ms) jusqu'à laquelle l'atténuation tient, même sans message déplié visible. */
    val holdUntilMs: Long = 0L,
) {

    /** Le résultat d'une bascule : le nouvel état, le sens du mouvement et le bord à retenir. */
    internal data class Toggle(
        val state: LongMessageExpansionState,
        val isExpanding: Boolean,
        val anchor: LongMessageExpansionLaw.Anchor,
    )

    fun isExpanded(messageId: String): Boolean = expandedId == messageId

    fun toggled(messageId: String, nowMs: Long): Toggle {
        val next = LongMessageExpansionLaw.nextExpanded(expandedId, messageId)
        val isExpanding = next != null
        return Toggle(
            state = LongMessageExpansionState(next, nowMs + HOLD_WINDOW_MS),
            isExpanding = isExpanding,
            anchor = LongMessageExpansionLaw.anchor(isExpanding),
        )
    }

    /** Vrai tant que le déplié est à l'écran, ou que la fenêtre de maintien court encore. */
    fun expansionVisible(expandedRowOnScreen: Boolean, nowMs: Long): Boolean =
        (expandedId != null && expandedRowOnScreen) || nowMs < holdUntilMs

    fun alphaFor(messageId: String, expandedRowOnScreen: Boolean, nowMs: Long): Float =
        LongMessageExpansionLaw.alpha(
            isExpandedCell = isExpanded(messageId),
            expansionVisible = expansionVisible(expandedRowOnScreen, nowMs),
        )

    private companion object {
        val HOLD_WINDOW_MS: Long = Math.round(LongMessageExpansionLaw.HOLD_WINDOW_SECONDS * 1000.0)
    }
}
