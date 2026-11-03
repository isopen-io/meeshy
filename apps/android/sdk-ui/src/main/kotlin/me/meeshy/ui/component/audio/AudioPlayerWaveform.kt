package me.meeshy.ui.component.audio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.waveform.AudioProgressDisplay
import me.meeshy.sdk.model.waveform.AudioScrubLaw
import me.meeshy.sdk.model.waveform.ScrubEvent
import me.meeshy.sdk.model.waveform.WaveformBarTint
import me.meeshy.sdk.model.waveform.WaveformBarsLayout
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics

private const val ACCENT_RESTING_ALPHA = 0.4f

/**
 * Onde de capsules scrubbable. Le glisser (et le simple tap : distance zéro) déplace la position
 * par [onSeek], prioritaire sur le défilement de la liste et l'appui long de la bulle (les
 * changements sont consommés), haptique légère à la levée. [onScrubbingChange] publie le signal
 * « scrubbing en cours » du contact à la levée ou à l'annulation.
 */
@Composable
public fun AudioPlayerWaveform(
    samples: List<Float>,
    display: AudioProgressDisplay,
    isCompact: Boolean,
    isDark: Boolean,
    accent: Color,
    enabled: Boolean,
    onSeek: (Double) -> Unit,
    onScrubbingChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val count = WaveformBarsLayout.barCount(isCompact)
    val heights = androidx.compose.runtime.remember(samples, count) { WaveformBarsLayout.heights(samples, count) }
    val unplayed = if (isDark) Color.White.copy(alpha = 0.20f) else Color.Black.copy(alpha = 0.12f)
    val live = accent
    val resting = accent.copy(alpha = ACCENT_RESTING_ALPHA)
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val label = stringResource(R.string.audio_player_waveform)
    val percent = (display.fraction * 100).toInt()
    val value = stringResource(R.string.audio_fullscreen_dial_value, percent)
    val signal = LocalAudioScrubSignal.current
    val haptics = rememberMeeshyHaptics()
    val currentSeek = rememberUpdatedState(onSeek)
    val currentScrub = rememberUpdatedState(onScrubbingChange)
    val currentEnabled = rememberUpdatedState(enabled)
    val currentRtl = rememberUpdatedState(rtl)

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(WaveformBarsLayout.BAND_HEIGHT_DP.dp)
            .semantics {
                contentDescription = label
                stateDescription = value
                progressBarRangeInfo = ProgressBarRangeInfo(display.fraction.toFloat(), 0f..1f)
                setProgress { target ->
                    currentSeek.value(target.toDouble().coerceIn(0.0, 1.0))
                    true
                }
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (!currentEnabled.value) return@awaitEachGesture
                    val width = size.width.toFloat()
                    fun seek(x: Float) = currentSeek.value(AudioScrubLaw.fraction(x, width, currentRtl.value))
                    down.consume()
                    signal?.begin()
                    currentScrub.value(true)
                    seek(down.position.x)
                    var end: ScrubEvent = ScrubEvent.Cancel
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Main)
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        if (change.positionChange() != Offset.Zero || !change.pressed) seek(change.position.x)
                        change.consume()
                        if (!change.pressed) {
                            end = ScrubEvent.Up
                            break
                        }
                    }
                    if (AudioScrubLaw.hapticOnEnd(end)) haptics.light()
                    signal?.end()
                    currentScrub.value(false)
                }
            },
    ) {
        val slot = size.width / count
        val barWidth = WaveformBarsLayout.barWidthDp(slot / density) * density
        val centerY = size.height / 2f
        for (index in 0 until count) {
            val played = WaveformBarsLayout.isPlayed(index, count, display.fraction)
            val color = when (WaveformBarsLayout.tint(played, display.isLive)) {
                WaveformBarTint.PLAYED_LIVE -> live
                WaveformBarTint.PLAYED_RESTING -> resting
                WaveformBarTint.UNPLAYED -> unplayed
            }
            val h = heights[index] * density
            val x = (if (rtl) count - 1 - index else index) * slot + (slot - barWidth) / 2f
            drawRoundRect(
                color = color,
                topLeft = Offset(x, centerY - h / 2f),
                size = Size(barWidth, h),
                cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f),
            )
        }
    }
}
