package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Les barres de progression segmentées du lecteur
 * et la pastille « traduit » de son en-tête. Un lot qui change leur rendu édite CE fichier, pas l'hôte.
 */
@Composable
internal fun SegmentedProgress(
    count: Int,
    index: Int,
    currentProgress: () -> Float,
    scrubber: StoryProgressScrubber = StoryProgressScrubber.None,
) {
    val position = stringResource(R.string.story_viewer_a11y_position, index + 1, count)
    val resources = LocalContext.current.resources
    StoryScrubTouchArea(
        scrubber = scrubber,
        label = position,
        percentLabel = { percent -> resources.getString(R.string.story_viewer_a11y_percent, percent) },
        onScrubbingChanged = {},
    ) { scrubbing ->
        SegmentRow(count, index, currentProgress, Modifier.align(Alignment.Center).alpha(if (scrubbing) 0f else 1f))
    }
}

@Composable
private fun SegmentRow(count: Int, index: Int, currentProgress: () -> Float, modifier: Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(count) { i ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.White.copy(alpha = 0.3f)),
            ) {
                // Lue en phase de dessin : l'avancement de la barre ne recompose rien.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .drawBehind {
                            val fill = when {
                                i < index -> 1f
                                i == index -> currentProgress().coerceIn(0f, 1f)
                                else -> 0f
                            }
                            if (fill <= 0f) return@drawBehind
                            val filled = size.width * fill
                            val left = if (layoutDirection == LayoutDirection.Rtl) size.width - filled else 0f
                            drawRoundRect(
                                color = MeeshyPalette.White,
                                topLeft = Offset(left, 0f),
                                size = Size(filled, size.height),
                                cornerRadius = CornerRadius(size.height / 2f),
                            )
                        },
                )
            }
        }
    }
}

@Composable
internal fun TranslatedBadge() {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.4f))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    ) {
        Text(
            text = stringResource(R.string.stories_translated),
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
