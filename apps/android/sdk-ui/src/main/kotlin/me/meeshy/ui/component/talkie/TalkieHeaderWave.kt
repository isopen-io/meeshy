package me.meeshy.ui.component.talkie

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.relation.TalkieWaveLaw
import me.meeshy.sdk.model.relation.TalkieWaveTrail
import me.meeshy.sdk.talkie.TalkieLevelReading
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Le pas de l'onde avec « Réduire les animations » : elle suit la voix à 10 Hz. */
internal const val REDUCED_FRAME_MS: Long = 100L

/**
 * Attend la prochaine image (60/120 Hz), ou 100 ms avec « Réduire les animations », et rend son horloge en nanosecondes.
 * L'état mis à jour n'est lu QUE dans le dessin : l'image suivante redessine le canevas, rien ne se recompose.
 */
internal suspend fun nextFrameNanos(reduceMotion: Boolean): Long {
    if (reduceMotion) {
        delay(REDUCED_FRAME_MS)
        return System.nanoTime()
    }
    return withFrameNanos { it }
}

/**
 * La traîne de l'onde (#17315, iso `TalkieHeaderWave`) : les niveaux défilent vers la droite, le plus récent à droite.
 * Elle lit le compteur à chaque image sans rien publier ; l'en-tête ne se recompose pas pour elle.
 */
@Composable
public fun TalkieHeaderWave(meter: TalkieLevelReading, color: Color, modifier: Modifier = Modifier) {
    val reduceMotion = LocalReduceMotion.current
    var trail by remember { mutableStateOf(TalkieWaveTrail()) }
    LaunchedEffect(meter, reduceMotion) {
        while (true) {
            val now = nextFrameNanos(reduceMotion)
            trail = trail.advanced(now, meter.level())
        }
    }
    val barWidth = with(LocalDensity.current) { 3.dp.toPx() }
    Canvas(modifier.clearAndSetSemantics { }) {
        val count = TalkieWaveLaw.barCount(size.width, barWidth, barWidth)
        val heights = TalkieWaveLaw.barHeights(trail.levels, count, barWidth, size.height)
        val span = count * barWidth + (count - 1) * barWidth
        drawBars(heights, origin = maxOf(size.width - span, 0f), barWidth = barWidth, gap = barWidth) { color }
    }
}

/** Des barres arrondies centrées verticalement, à partir de [origin]. */
internal fun DrawScope.drawBars(
    heights: List<Float>,
    origin: Float,
    barWidth: Float,
    gap: Float,
    colorOf: (Float) -> Color,
) {
    heights.forEachIndexed { index, height ->
        val x = origin + index * (barWidth + gap)
        drawRoundRect(
            color = colorOf(height),
            topLeft = Offset(x, (size.height - height) / 2),
            size = Size(barWidth, height),
            cornerRadius = CornerRadius(barWidth / 2, barWidth / 2),
        )
    }
}
