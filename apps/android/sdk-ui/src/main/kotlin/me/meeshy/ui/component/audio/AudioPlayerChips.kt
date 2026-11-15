package me.meeshy.ui.component.audio

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.boundedScale

private const val CHIP_ACTIVE_ALPHA = 0.85f

/** Colonne droite du lecteur : chip vitesse (cyclique) au-dessus du chip pourcentage (plein écran). */
@Composable
public fun AudioPlayerChipsColumn(
    speed: PlaybackSpeed,
    progressFraction: Double,
    isCompact: Boolean,
    isDark: Boolean,
    accent: Color,
    onCycleSpeed: () -> Unit,
    onFullscreen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(if (isCompact) 3.dp else 4.dp),
    ) {
        SpeedChip(speed, isCompact, isDark, accent, onCycleSpeed)
        PercentageChip(progressFraction, isCompact, isDark, accent, onFullscreen)
    }
}

@Composable
private fun idleFill(isDark: Boolean): Color = if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.05f)

@Composable
private fun idleInk(isDark: Boolean): Color = if (isDark) Color.White.copy(alpha = 0.55f) else Color.Black.copy(alpha = 0.45f)

@Composable
private fun SpeedChip(speed: PlaybackSpeed, isCompact: Boolean, isDark: Boolean, accent: Color, onCycle: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val isDefault = speed == PlaybackSpeed.X1_0
    val label = stringResource(R.string.media_audio_speed_cycle, speed.label)
    ChipText(
        text = speed.label,
        weight = FontWeight.Bold,
        isCompact = isCompact,
        fill = if (isDefault) idleFill(isDark) else accent.copy(alpha = CHIP_ACTIVE_ALPHA),
        ink = if (isDefault) idleInk(isDark) else Color.White,
        modifier = Modifier
            .semantics { contentDescription = label; role = Role.Button }
            .clickable {
                haptics.light()
                onCycle()
            }
            .meeshyTapTarget(),
    )
}

@Composable
private fun PercentageChip(
    fraction: Double,
    isCompact: Boolean,
    isDark: Boolean,
    accent: Color,
    onFullscreen: (() -> Unit)?,
) {
    val haptics = rememberMeeshyHaptics()
    val percent = (fraction * 100).toInt()
    val started = percent > 0
    val chip: @Composable (Modifier) -> Unit = { mod ->
        ChipText(
            text = "$percent%",
            weight = FontWeight.ExtraBold,
            isCompact = isCompact,
            fill = if (started) accent.copy(alpha = CHIP_ACTIVE_ALPHA) else idleFill(isDark),
            ink = if (started) Color.White else idleInk(isDark),
            modifier = mod,
        )
    }
    if (onFullscreen == null) {
        chip(Modifier.clearAndSetSemantics { })
        return
    }
    val label = stringResource(R.string.media_audio_open_fullscreen, percent)
    val hint = stringResource(R.string.media_audio_open_fullscreen_hint)
    chip(
        Modifier
            .semantics {
                contentDescription = label
                role = Role.Button
                onClick(label = hint) { onFullscreen(); true }
            }
            .clickable {
                haptics.light()
                onFullscreen()
            }
            .meeshyTapTarget(),
    )
}

@Composable
private fun ChipText(
    text: String,
    weight: FontWeight,
    isCompact: Boolean,
    fill: Color,
    ink: Color,
    modifier: Modifier,
) {
    Text(
        text = text,
        color = ink,
        fontFamily = FontFamily.Monospace,
        fontWeight = weight,
        fontSize = (if (isCompact) 9 else 10).sp.boundedScale(),
        maxLines = 1,
        modifier = modifier
            .background(fill, CircleShape)
            .padding(horizontal = if (isCompact) 7.dp else 8.dp, vertical = if (isCompact) 2.dp else 3.dp),
    )
}
