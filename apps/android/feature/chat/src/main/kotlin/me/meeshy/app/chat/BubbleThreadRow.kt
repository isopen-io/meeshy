package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.MessageBubble
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le rendu en BULLE d'une rangée du fil (mode Bulles, Résumé, Rivière) — la branche bulle de
 * [ChatMessageRow], extraite pour que l'écran ne la porte plus. iOS : la bulle envoyée porte l'indigo
 * de marque (BubbleSkin.brand), l'accent de la conversation reste aux liens, citations et réactions.
 */
@Composable
internal fun BubbleThreadRow(
    bubble: BubbleContent,
    accentColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    mentionDisplayNames: Map<String, String>?,
    highlightTerm: String?,
    linkAccessory: (@Composable (Color) -> Unit)?,
) {
    MessageBubble(
        content = bubble,
        outgoingColor = MeeshyPalette.Indigo500,
        accentColor = accentColor,
        mentionDisplayNames = mentionDisplayNames,
        highlightTerm = highlightTerm,
        callbacks = callbacks,
        audioPlayback = audioPlayback,
        bodyAccessory = linkAccessory,
    )
}
