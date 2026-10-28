package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import me.meeshy.sdk.model.audioedit.AudioEditorStaging
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import me.meeshy.sdk.model.format.LocalizedNumber
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Les vitesses proposées par l'outil Vitesse — celles d'iOS. */
private val SPEEDS = listOf(0.5, 0.75, 1.0, 1.25, 1.5, 2.0)

/** Le panneau de l'outil actif — miroir d'`AudioEditorToolPanel` (iOS) : un seul réglage visible à la fois. */
@Composable
internal fun AudioEditorToolPanel(
    tool: AudioEditorTool,
    staging: AudioEditorStaging,
    duration: Double,
    accent: Color,
    onChange: ((AudioEditorStaging) -> AudioEditorStaging) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalMeeshyTokens.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lgPlus))
            .background(tokens.textPrimary.copy(alpha = 0.05f))
            .border(1.dp, tokens.hairline, RoundedCornerShape(MeeshyRadius.lgPlus))
            .padding(MeeshySpacing.mdPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        when (tool) {
            AudioEditorTool.TRIM -> SelectionHint(stringResource(R.string.audio_editor_trim_hint), accent) {
                onChange { it.select(AudioEditorTool.TRIM, duration) }
            }
            AudioEditorTool.SPLIT -> SelectionHint(stringResource(R.string.audio_editor_split_hint), accent) {
                onChange { it.select(AudioEditorTool.SPLIT, duration) }
            }
            AudioEditorTool.FADE -> FadePanel(staging, accent, onChange)
            AudioEditorTool.SPEED -> SpeedPanel(staging.speed) { rate -> onChange { it.copy(speed = rate) } }
            AudioEditorTool.VOLUME -> VolumePanel(staging.gain, accent) { gain -> onChange { it.copy(gain = gain) } }
            AudioEditorTool.TRANSCRIBE -> Unit
        }
    }
}

@Composable
private fun SelectionHint(text: String, accent: Color, onReset: () -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Text(text, Modifier.weight(1f), color = tokens.textSecondary, fontSize = 13.sp)
        Text(
            stringResource(R.string.audio_editor_reset),
            Modifier
                .clickable(role = Role.Button) { haptics.light(); onReset() }
                .padding(vertical = MeeshySpacing.sm, horizontal = MeeshySpacing.xs),
            color = accent,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun FadePanel(
    staging: AudioEditorStaging,
    accent: Color,
    onChange: ((AudioEditorStaging) -> AudioEditorStaging) -> Unit,
) {
    SwitchRow(stringResource(R.string.audio_editor_fade_in), staging.fadeIn, accent) { on -> onChange { it.copy(fadeIn = on) } }
    SwitchRow(stringResource(R.string.audio_editor_fade_out), staging.fadeOut, accent) { on -> onChange { it.copy(fadeOut = on) } }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, accent: Color, onChecked: (Boolean) -> Unit) {
    val tokens = LocalMeeshyTokens.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), color = tokens.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        Switch(checked, onChecked, colors = SwitchDefaults.colors(checkedTrackColor = accent))
    }
}

@Composable
private fun SpeedPanel(speed: Double, onSpeed: (Double) -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SPEEDS.forEach { value ->
            val active = abs(speed - value) < ACTIVE_EPSILON
            Text(
                "${speedNumber(value)}×",
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(MeeshyRadius.xs))
                    .background(if (active) MeeshyGradients.brand else androidx.compose.ui.graphics.SolidColor(tokens.textPrimary.copy(alpha = 0.06f)))
                    .semantics { role = Role.RadioButton; selected = active }
                    .clickable { haptics.light(); onSpeed(value) }
                    .padding(vertical = MeeshySpacing.smPlus),
                color = if (active) Color.White else tokens.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun VolumePanel(gain: Double, accent: Color, onGain: (Double) -> Unit) {
    val tokens = LocalMeeshyTokens.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Icon(MeeshyIcons.VolumeOff, null, Modifier.size(16.dp), tint = tokens.textMuted)
        Slider(
            value = gain.toFloat(),
            onValueChange = { onGain(snapGain(it)) },
            valueRange = 0f..GAIN_MAX,
            steps = GAIN_STEPS,
            modifier = Modifier.weight(1f),
            colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent),
        )
        Icon(MeeshyIcons.VolumeUp, null, Modifier.size(16.dp), tint = tokens.textMuted)
    }
    Text(
        if (abs(gain - 1.0) < ACTIVE_EPSILON) stringResource(R.string.audio_editor_volume_normal)
        else LocalizedNumber.percent((gain * PERCENT).toInt(), Locale.getDefault()),
        Modifier.fillMaxWidth(),
        color = accent,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
    )
}

/** Le curseur de volume avance par pas de 0,05, comme `Slider(step: 0.05)` d'iOS. */
private fun snapGain(raw: Float): Double = Math.round(raw / GAIN_STEP) * GAIN_STEP.toDouble()

private fun speedNumber(value: Double): String =
    NumberFormat.getInstance(Locale.getDefault()).apply { maximumFractionDigits = 2 }.format(value)

private const val GAIN_MAX = 2f
private const val GAIN_STEP = 0.05f
private const val GAIN_STEPS = 39
private const val PERCENT = 100
private const val ACTIVE_EPSILON = 0.001
