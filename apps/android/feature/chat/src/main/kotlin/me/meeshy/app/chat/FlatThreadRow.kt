package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.FlatRowFocus
import me.meeshy.ui.component.bubble.FocalFlatRow

/**
 * Le rendu en rangée PLATE d'une rangée du fil (Script, Focal) : aucune bulle, l'identité en tête de
 * groupe, la colonne méta à droite. [metaAlpha] est lue au dessin, [focus] non nul fait de la
 * rangée l'élue de la scène Focal.
 */
@Composable
internal fun FlatThreadRow(
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
    FocalFlatRow(
        content = bubble,
        accentColor = accentColor,
        callbacks = callbacks,
        audioPlayback = audioPlayback,
        mentionDisplayNames = mentionDisplayNames,
        highlightTerm = highlightTerm,
        metaAlpha = metaAlpha,
        bodyAccessory = linkAccessory,
        focus = focus,
    )
}
