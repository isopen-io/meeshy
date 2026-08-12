package me.meeshy.app.chat

import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay5
import androidx.compose.material.icons.filled.Forward5
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import kotlin.math.roundToInt

/**
 * The interactive audio preview shown in the long-press overlay — play/pause, a
 * draggable scrubber, ±5 s skip, and a tap-to-cycle speed chip (`0.5 … 2.0×`).
 *
 * The *decision* logic (what each control does to the playhead, how loading /
 * ready / end reconcile, the rate grid) is the pure, JVM-covered
 * [OverlayMediaTransport]; this composable is the exempt glue that mirrors that
 * state onto a real [MediaPlayer] and back. A faithful port of iOS
 * `PreviewAudioPlayer` (`MessageOverlayMenu.swift`), which Android surpasses with
 * the single-tap speed chip instead of a context menu.
 *
 * Video interactive preview is a tracked follow-up: `BubbleContent` does not yet
 * carry a playable video attachment, so there is nothing to drive here.
 */
@Composable
internal fun OverlayMediaPreview(
    audio: BubbleAudio,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    val url = audio.url ?: return
    var transport by remember(url) { mutableStateOf(OverlayMediaTransport.idle()) }
    val player = remember { MediaPlayer() }

    // Reconcile a transport transition onto the platform player, then commit it as
    // the new state. Every user action flows through here so the player never drifts
    // from the pure state. Runtime side-effects are guarded — a failed seek/rate on a
    // torn-down player degrades to a no-op rather than crashing the overlay.
    fun apply(next: OverlayMediaTransport) {
        val prev = transport
        when {
            next.isLoading && next.currentUrl != null && next.currentUrl != prev.currentUrl ->
                runCatching {
                    player.reset()
                    player.setDataSource(url)
                    player.prepareAsync()
                }
            next.isPlaying && !prev.isPlaying ->
                runCatching {
                    player.playbackParams = player.playbackParams.setSpeed(next.playbackRate)
                    player.start()
                }
            !next.isPlaying && prev.isPlaying -> runCatching { player.pause() }
        }
        if (!next.isLoading && next.currentSeconds != prev.currentSeconds) {
            runCatching { player.seekTo((next.currentSeconds * 1000).roundToInt()) }
        }
        if (next.playbackRate != prev.playbackRate && next.isPlaying) {
            runCatching { player.playbackParams = player.playbackParams.setSpeed(next.playbackRate) }
        }
        transport = next
    }

    DisposableEffect(url) {
        player.setOnPreparedListener {
            runCatching { it.playbackParams = it.playbackParams.setSpeed(transport.playbackRate) }
            runCatching { it.start() }
            transport = transport.ready()
        }
        player.setOnCompletionListener { transport = transport.onEnded() }
        player.setOnErrorListener { _, _, _ ->
            transport = transport.failed()
            true
        }
        onDispose { runCatching { player.release() } }
    }

    // Poll the real playhead while playing to advance the scrubber (iOS periodic
    // time observer). tick reads position/duration off the player; it never writes
    // back to it, so there is no seek feedback loop with the user's own scrub.
    LaunchedEffect(transport.isPlaying) {
        while (transport.isPlaying) {
            val durationSeconds = player.duration.takeIf { it > 0 }?.div(1000.0) ?: 0.0
            transport = transport.tick(player.currentPosition / 1000.0, durationSeconds)
            delay(100)
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                PlayPauseButton(
                    isPlaying = transport.isPlaying,
                    isLoading = transport.isLoading,
                    accentColor = accentColor,
                    onClick = { apply(transport.toggle(url)) },
                )
                Text(
                    text = transport.timeLabel(audio.durationSeconds),
                    color = MeeshyTheme.tokens.textSecondary,
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.weight(1f),
                )
                SpeedChip(
                    rate = transport.playbackRate,
                    accentColor = accentColor,
                    onClick = { apply(transport.cycleRate()) },
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                IconButton(onClick = { apply(transport.skip(-OverlayMediaTransport.SKIP_SECONDS)) }) {
                    Icon(
                        imageVector = Icons.Filled.Replay5,
                        contentDescription = stringResource(R.string.chat_media_skip_back),
                        tint = MeeshyTheme.tokens.textMuted,
                    )
                }
                Slider(
                    value = transport.progress.toFloat(),
                    onValueChange = { apply(transport.seek(it.toDouble())) },
                    valueRange = 0f..1f,
                    colors = SliderDefaults.colors(
                        thumbColor = accentColor,
                        activeTrackColor = accentColor,
                    ),
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${transport.percentInt}%",
                    color = if (transport.percentInt == 0) MeeshyTheme.tokens.textMuted else accentColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                )
                IconButton(onClick = { apply(transport.skip(OverlayMediaTransport.SKIP_SECONDS)) }) {
                    Icon(
                        imageVector = Icons.Filled.Forward5,
                        contentDescription = stringResource(R.string.chat_media_skip_forward),
                        tint = MeeshyTheme.tokens.textMuted,
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayPauseButton(
    isPlaying: Boolean,
    isLoading: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val label = stringResource(if (isPlaying) R.string.chat_media_pause else R.string.chat_media_play)
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(accentColor.copy(alpha = 0.2f))
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (isLoading) {
            CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            IconButton(onClick = onClick, modifier = Modifier.size(40.dp)) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = accentColor,
                )
            }
        }
    }
}

@Composable
private fun SpeedChip(
    rate: Float,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val label = stringResource(R.string.chat_media_playback_speed)
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = accentColor.copy(alpha = 0.12f),
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        Text(
            text = "${formatRate(rate)}×",
            color = accentColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        )
    }
}

private fun formatRate(rate: Float): String {
    val rounded = (rate * 100).roundToInt()
    return if (rounded % 100 == 0) "${rounded / 100}" else (rounded / 100.0).toString().trimEnd('0').trimEnd('.')
}
