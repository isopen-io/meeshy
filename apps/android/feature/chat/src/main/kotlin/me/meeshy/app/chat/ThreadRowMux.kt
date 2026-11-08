package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.FlatRowFocus

/** Les deux rendus d'une rangée du fil : la rangée plate (Script, Focal) ou la bulle. */
internal enum class ThreadRowRendering { Flat, Bubble }

/**
 * Le mux du fil (iOS `usesFlatRow`) : le mode de lecture courant décide du rendu de CHAQUE rangée.
 * Drapeau allumé + Automatique = Script (rangées plates), drapeau éteint = Bulles ; un choix
 * Focal / Script / Bulles prend effet aussitôt. Résumé et Rivière gardent la bulle sous leur surcouche.
 * Un mode inconnu (contrôleur absent) retombe sur la bulle, le rendu historique.
 */
internal object ThreadRowMux {
    fun rendering(mode: ConversationReadingMode?): ThreadRowRendering =
        if (mode?.usesFlatRow == true) ThreadRowRendering.Flat else ThreadRowRendering.Bubble
}

/** Choisit le rendu de la rangée selon [rendering] : plate (iOS `FocalRow`) ou bulle (le rendu historique). */
@Composable
internal fun ThreadRow(
    rendering: ThreadRowRendering,
    bubble: BubbleContent,
    accentColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    mentionDisplayNames: Map<String, String>?,
    highlightTerm: String?,
    linkAccessory: (@Composable (Color) -> Unit)?,
    metaAlpha: () -> Float,
    focus: FlatRowFocus?,
) {
    when (rendering) {
        ThreadRowRendering.Flat -> FlatThreadRow(
            bubble, accentColor, callbacks, audioPlayback, mentionDisplayNames, highlightTerm, linkAccessory, metaAlpha, focus,
        )
        ThreadRowRendering.Bubble -> BubbleThreadRow(
            bubble, accentColor, callbacks, audioPlayback, mentionDisplayNames, highlightTerm, linkAccessory,
        )
    }
}
