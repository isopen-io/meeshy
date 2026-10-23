package me.meeshy.ui.component.audio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.fullscreen.AudioDialGeometry
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private const val FRAME_INTERVAL_NANOS = 33_000_000L
private const val TAU = 2 * PI

/**
 * Le spectre du vocal en anneau autour du portrait, et son curseur circulaire (miroir de
 * `AudioFullscreenDial`). Seul l'anneau (bande de 40 dp) capte le doigt ; le portrait dessous
 * garde son toucher. [onSeek] reçoit une fraction 0..1 qui ne saute jamais par-dessus midi.
 * La durée totale s'affiche à gauche de midi, le temps écoulé à droite.
 */
@Composable
public fun AudioFullscreenDial(
    samples: List<Float>,
    progress: Double,
    isPlaying: Boolean,
    portraitDiameter: Dp,
    accent: Color,
    trackColor: Color,
    cursorColor: Color,
    totalLabel: String,
    elapsedLabel: String,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val density = LocalDensity.current
    val side = portraitDiameter + AudioDialGeometry.BAND.dp * 2
    var scrubbing by remember { mutableStateOf<Double?>(null) }
    val shown = scrubbing ?: progress
    val animated = isPlaying && !reduceMotion
    var time by remember { mutableDoubleStateOf(0.0) }
    val seek by rememberUpdatedState(onSeek)
    val currentProgress by rememberUpdatedState(progress)
    val bars = remember(samples) { AudioDialGeometry.resample(samples) }

    LaunchedEffect(animated) {
        if (!animated) return@LaunchedEffect
        var last = 0L
        while (true) {
            androidx.compose.runtime.withFrameNanos { now ->
                if (now - last >= FRAME_INTERVAL_NANOS) {
                    last = now
                    time = now / 1_000_000_000.0
                }
            }
        }
    }

    val label = stringResource(R.string.audio_fullscreen_dial)
    val value = stringResource(R.string.audio_fullscreen_dial_value, AudioDialGeometry.percent(shown))

    Box(
        modifier = modifier
            .size(side)
            .pointerInput(portraitDiameter) {
                val sidePx = side.toPx()
                val portraitPx = portraitDiameter.toPx()
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (!AudioDialGeometry.isInRing(down.position.x, down.position.y, sidePx, portraitPx)) {
                        return@awaitEachGesture
                    }
                    down.consume()
                    haptics.light()
                    var position = down.position
                    var pressed = true
                    while (pressed) {
                        val raw = AudioDialGeometry.fraction(position.x, position.y, sidePx, sidePx)
                        val next = AudioDialGeometry.scrubbed(scrubbing ?: raw, raw)
                        scrubbing = next
                        seek(next)
                        val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id }
                        if (change == null) {
                            pressed = false
                        } else {
                            pressed = change.pressed
                            position = change.position
                            change.consume()
                        }
                    }
                    scrubbing = null
                }
            }
            .semantics(mergeDescendants = true) {
                contentDescription = label
                stateDescription = value
                progressBarRangeInfo = ProgressBarRangeInfo(
                    current = shown.toFloat().coerceIn(0f, 1f),
                    range = 0f..1f,
                    steps = 19,
                )
                setProgress { target ->
                    seek(AudioDialGeometry.adjusted(currentProgress, increment = target > currentProgress))
                    true
                }
            },
        contentAlignment = Alignment.TopCenter,
    ) {
        Canvas(Modifier.size(side)) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val foot = with(density) { portraitDiameter.toPx() } / 2f + AudioDialGeometry.GAP.dp.toPx()
            val barLength = AudioDialGeometry.BAR_LENGTH.dp.toPx()
            val width = 3.dp.toPx()
            val count = AudioDialGeometry.BAR_COUNT
            for (bar in 0 until count) {
                val sample = if (bars.isEmpty()) AudioDialGeometry.fallbackHeight(bar) else bars[bar]
                val pulse = AudioDialGeometry.pulse(bar, shown, time, animated)
                val length = AudioDialGeometry.barLength(sample, pulse).let {
                    (it / AudioDialGeometry.BAR_LENGTH) * barLength
                }
                val played = shown > 0 && bar.toDouble() / count <= shown
                rotate(degrees = (bar.toFloat() / count) * 360f, pivot = center) {
                    drawRoundRect(
                        color = if (played) accent else trackColor,
                        topLeft = Offset(center.x - width / 2f, center.y - foot - length),
                        size = Size(width, length),
                        cornerRadius = CornerRadius(width / 2f),
                    )
                }
            }
            val orbit = foot + barLength / 2f
            val angle = shown * TAU
            val cursor = Offset(
                center.x + (sin(angle) * orbit).toFloat(),
                center.y - (cos(angle) * orbit).toFloat(),
            )
            val radius = (if (scrubbing == null) 8 else 11).dp.toPx()
            drawCircle(accent, radius + 3.dp.toPx(), cursor)
            drawCircle(cursorColor, radius, cursor)
        }
        androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 2.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = totalLabel,
                    color = trackColor,
                    fontSize = 11.sp,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f).padding(end = 6.dp),
                )
                Text(
                    text = elapsedLabel,
                    color = accent,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Start,
                    modifier = Modifier.weight(1f).padding(start = 6.dp),
                )
            }
        }
    }
}
