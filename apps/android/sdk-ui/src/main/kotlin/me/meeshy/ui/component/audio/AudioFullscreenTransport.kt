package me.meeshy.ui.component.audio

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.accessibility.AdjustDirection
import me.meeshy.sdk.model.fullscreen.AudioFullscreenSpeed
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.meeshyAdjustable
import me.meeshy.ui.component.fullscreen.AudioOutputPicker
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.FullscreenChromeTone
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le diamètre du bouton de lecture du plein écran audio (iOS 56 pt). */
public val AudioFullscreenPlayDiameter: androidx.compose.ui.unit.Dp = 56.dp

/**
 * **Le transport du plein écran audio** (iOS `AudioFullscreenPage.transport`) : la pastille de vitesse — un palier par
 * toucher ([AudioFullscreenSpeed]), ajustable au balayage de TalkBack —, −10 s, la lecture (56 dp, roue pendant le
 * chargement), +10 s, et la sortie audio. Chaque geste appelle [onInteraction], qui relance l'effacement du chrome.
 */
@Composable
public fun AudioFullscreenTransport(
    speed: PlaybackSpeed,
    isPlaying: Boolean,
    isLoading: Boolean,
    accent: Color,
    onSpeedChange: (PlaybackSpeed) -> Unit,
    onSkip: (Double) -> Unit,
    onPlayPause: () -> Unit,
    modifier: Modifier = Modifier,
    showsOutput: Boolean = true,
    onInteraction: () -> Unit = {},
) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AudioFullscreenSpeedChip(
            speed = speed,
            accent = accent,
            onSpeedChange = { next ->
                onInteraction()
                haptics.light()
                onSpeedChange(next)
            },
        )
        FullscreenChromeButton(
            icon = Icons.Filled.Replay10,
            label = stringResource(R.string.media_skipBack10s),
            onClick = {
                onInteraction()
                haptics.light()
                onSkip(-SKIP_SECONDS)
            },
            tone = FullscreenChromeTone.Adaptive,
        )
        AudioFullscreenPlayButton(
            isPlaying = isPlaying,
            isLoading = isLoading,
            accent = accent,
            onClick = {
                onInteraction()
                haptics.light()
                onPlayPause()
            },
        )
        FullscreenChromeButton(
            icon = Icons.Filled.Forward10,
            label = stringResource(R.string.media_skipForward10s),
            onClick = {
                onInteraction()
                haptics.light()
                onSkip(SKIP_SECONDS)
            },
            tone = FullscreenChromeTone.Adaptive,
        )
        AudioOutputPicker(tone = FullscreenChromeTone.Adaptive, isCaptureShielded = !showsOutput)
    }
}

/** La pastille de vitesse : son libellé est la vitesse, TalkBack l'augmente ou la diminue d'un palier. */
@Composable
internal fun AudioFullscreenSpeedChip(
    speed: PlaybackSpeed,
    accent: Color,
    onSpeedChange: (PlaybackSpeed) -> Unit,
    modifier: Modifier = Modifier,
) {
    val steps = AudioFullscreenSpeed.steps
    val position = steps.indexOf(speed).coerceAtLeast(0).toFloat()
    val description = stringResource(R.string.media_audio_speed_cycle, speed.label)
    val tint = if (speed == PlaybackSpeed.X1_0) MeeshyTheme.tokens.textPrimary.copy(alpha = CHIP_REST_ALPHA) else accent.copy(alpha = CHIP_TINT_ALPHA)
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = FullscreenChromeDimens.tapTarget, minHeight = FullscreenChromeDimens.tapTarget)
            .clip(RoundedCornerShape(percent = 50))
            .clickable(role = Role.Button) { onSpeedChange(AudioFullscreenSpeed.next(speed)) }
            .meeshyAdjustable(
                value = position,
                range = 0f..(steps.size - 1).toFloat(),
                valueLabel = speed.label,
                onAdjust = { direction ->
                    onSpeedChange(
                        when (direction) {
                            AdjustDirection.INCREMENT -> AudioFullscreenSpeed.next(speed)
                            AdjustDirection.DECREMENT -> AudioFullscreenSpeed.previous(speed)
                        },
                    )
                },
            )
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .defaultMinSize(minWidth = FullscreenChromeDimens.discDiameter, minHeight = FullscreenChromeDimens.discDiameter)
                .clip(RoundedCornerShape(percent = 50))
                .background(tint)
                .padding(horizontal = MeeshySpacing.sm),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = speed.label,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}

/** Le bouton de lecture : 56 dp teintés par l'accent, la roue tant que la piste se charge. */
@Composable
internal fun AudioFullscreenPlayButton(
    isPlaying: Boolean,
    isLoading: Boolean,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = if (isPlaying) stringResource(R.string.media_pauseAudio) else stringResource(R.string.media_playAudio)
    val ink = MeeshyTheme.tokens.textPrimary
    Box(
        modifier = modifier
            .size(AudioFullscreenPlayDiameter)
            .clip(CircleShape)
            .background(accent.copy(alpha = PLAY_TINT_ALPHA))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (isLoading) {
            CircularProgressIndicator(color = ink, strokeWidth = 2.dp, modifier = Modifier.size(PLAY_GLYPH))
        } else {
            Icon(
                imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = ink,
                modifier = Modifier.size(PLAY_GLYPH),
            )
        }
    }
}

private const val SKIP_SECONDS = 10.0
private const val CHIP_REST_ALPHA = 0.12f
private const val CHIP_TINT_ALPHA = 0.6f
private const val PLAY_TINT_ALPHA = 0.45f
private val PLAY_GLYPH = 24.dp
