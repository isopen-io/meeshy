package me.meeshy.ui.component.talkie

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.relation.TalkieHeaderBarLook
import me.meeshy.sdk.model.relation.TalkieWaveLaw
import me.meeshy.sdk.talkie.TalkieLevelReading
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

private val FADE_LEFT = Brush.horizontalGradient(listOf(Color.Transparent, Color.White, Color.White))

/** Une image du spectre : le niveau lissé et l'horloge de la houle. */
@Immutable
private data class SpectrumFrame(val level: Float = 0f, val timeSeconds: Double = 0.0)

/**
 * Le spectre du direct (#17339, iso `TalkieLiveSpectrum`) : ce qui se dit, maintenant, centré et en miroir. Lit le compteur
 * à chaque image sans rien publier ; avec « Réduire les animations », il suit la voix à 10 Hz sans houle.
 */
@Composable
internal fun TalkieLiveSpectrum(meter: TalkieLevelReading, modifier: Modifier = Modifier) {
    val reduceMotion = LocalReduceMotion.current
    var frame by remember { mutableStateOf(SpectrumFrame()) }
    LaunchedEffect(meter, reduceMotion) {
        val origin = System.nanoTime()
        while (true) {
            val now = nextFrameNanos(reduceMotion)
            val time = if (reduceMotion) 0.0 else (now - origin) / 1e9
            frame = SpectrumFrame(TalkieWaveLaw.smoothed(frame.level, meter.level()), time)
        }
    }
    val barWidth = with(LocalDensity.current) { 3.5.dp.toPx() }
    val gap = with(LocalDensity.current) { 3.dp.toPx() }
    Canvas(modifier.fillMaxSize().clearAndSetSemantics { }) {
        val count = TalkieWaveLaw.barCount(size.width, barWidth, gap)
        val heights = TalkieWaveLaw.mirroredBarHeights(frame.level, count, frame.timeSeconds, barWidth, size.height)
        val span = count * barWidth + maxOf(count - 1, 0) * gap
        drawBars(heights, origin = maxOf((size.width - span) / 2, 0f), barWidth = barWidth, gap = gap) { height ->
            Color.White.copy(alpha = TalkieHeaderBarLook.barAlpha(height, barWidth, size.height))
        }
    }
}

/**
 * La bande d'enregistrement hors ligne (iso `TalkieRecordingTape`) : la voix défile vers une tête rouge, l'histoire
 * s'estompe à gauche.
 */
@Composable
internal fun TalkieRecordingTape(meter: TalkieLevelReading, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
        TalkieHeaderWave(
            meter = meter,
            color = Color.White,
            modifier = Modifier
                .fillMaxSize()
                .padding(end = MeeshySpacing.xs)
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    drawRect(FADE_LEFT, blendMode = BlendMode.DstIn)
                },
        )
        Box(
            Modifier
                .fillMaxHeight()
                .padding(vertical = 4.dp)
                .width(2.dp)
                .background(MeeshyPalette.ErrorStrong, CircleShape),
        )
    }
}
