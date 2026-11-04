package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleNonVisualSections
import me.meeshy.ui.component.bubble.BubbleSealedPieceRow
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les blocs NON média de la rangée plate (iOS `FocalNonMediaBlock`) : pièces scellées, fichiers (partage au tap),
 * lieu partagé (carte plein écran au tap) et notes vocales. Ils partagent la colonne de contenu indentée de 29 de la
 * rangée — la grille visuelle est montée à part par [FocalMediaGrid].
 */
@Composable
internal fun FocalNonMediaBlock(
    content: BubbleContent,
    onColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    accentColor: Color = Color.Unspecified,
) {
    content.sealedPieceIds.forEach { _ ->
        BubbleSealedPieceRow(onColor = onColor, modifier = Modifier.padding(bottom = MeeshySpacing.xs))
    }
    BubbleNonVisualSections(content, onColor, callbacks, audioPlayback, includeAudios = false)
    FocalAudioBlock(content, onColor, callbacks, audioPlayback, accentColor = accentColor)
}
