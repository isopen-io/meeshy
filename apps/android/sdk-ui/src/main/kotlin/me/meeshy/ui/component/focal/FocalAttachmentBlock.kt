package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.reading.focal.FocalMediaGridLayout
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Les pièces jointes de la rangée plate (iOS `FocalAttachmentBlock`) : la grille visuelle (photos et vidéos, 300 dp au
 * plus) puis les blocs non-média. Chaque case porte sa propre protection ; le double tap pour réagir n'est monté que
 * sur une case qui l'offre ([BubbleCallbacks.onReactToAttachment]).
 */
@Composable
internal fun FocalAttachmentBlock(
    content: BubbleContent,
    ink: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    accentColor: Color = Color.Unspecified,
) {
    val visuals = remember(content.images, content.videos, content.files) { focalVisuals(content) }
    Column(Modifier.widthIn(max = FocalMediaGridLayout.GRID_MAX_WIDTH.dp)) {
        FocalMediaGrid(visuals = visuals, callbacks = callbacks)
        Column(Modifier.clip(RoundedCornerShape(FocalMetrics.Media.RADIUS.toFloat().dp))) {
            FocalNonMediaBlock(content, ink, callbacks, audioPlayback, accentColor)
        }
    }
}
