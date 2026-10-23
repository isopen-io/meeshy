package me.meeshy.ui.component

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PresenceStyle
import me.meeshy.sdk.model.avatar.PresenceArrival
import me.meeshy.sdk.model.avatar.PresenceHereWave

private val WaveEasing = CubicBezierEasing(
    PresenceStyle.WAVE_EASE_X1,
    PresenceStyle.WAVE_EASE_Y1,
    PresenceStyle.WAVE_EASE_X2,
    PresenceStyle.WAVE_EASE_Y2,
)

/**
 * Onde continue du point « ici » (miroir de `PresenceHereWaveView`) : un disque qui part du point, grandit
 * jusqu'a [PresenceHereWave.peakScale] et s'eteint, en easeOut repete. Echelle et opacite seulement. Le
 * parent ne la monte pas sous Reduire les animations.
 */
@Composable
internal fun PresenceHereWaveView(color: Color, diameter: Dp, wave: PresenceHereWave) {
    val phase by rememberInfiniteTransition(label = "hereWave").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(wave.durationMillis, easing = WaveEasing), RepeatMode.Restart),
        label = "hereWavePhase",
    )
    Box(
        Modifier
            .size(diameter)
            .scale(1f + (wave.peakScale - 1f) * phase)
            .background(color.copy(alpha = wave.startOpacity * (1f - phase)), CircleShape),
    )
}

/** Gros pulse unique a l'arrivee « ici » : un anneau part du point, s'elargit et s'eteint avant qu'il se stabilise. */
@Composable
internal fun PresenceArrivalRipple(color: Color, diameter: Dp) {
    val phase = remember { Animatable(0f) }
    LaunchedEffect(Unit) { phase.animateTo(1f, tween(PresenceArrival.DURATION_MILLIS, easing = LinearEasing)) }
    Box(
        Modifier
            .size(diameter)
            .scale(1f + (PresenceArrival.PEAK_SCALE - 1f) * phase.value)
            .drawBehind {
                drawCircle(
                    color = color.copy(alpha = PresenceArrival.START_OPACITY * (1f - phase.value)),
                    style = Stroke(width = PresenceArrival.LINE_WIDTH.dp.toPx()),
                )
            },
    )
}
