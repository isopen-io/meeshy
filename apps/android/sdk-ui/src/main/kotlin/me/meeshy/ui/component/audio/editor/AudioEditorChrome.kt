package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditorMode
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Un bouton rond du bandeau (fermer, annuler, rétablir) — cible de 44 dp. */
@Composable
internal fun CircleButton(icon: ImageVector, description: String, enabled: Boolean = true, onClick: () -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(tokens.textPrimary.copy(alpha = 0.06f))
            .semantics { role = Role.Button }
            .clickable(enabled = enabled) { haptics.light(); onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, description, Modifier.size(20.dp), tint = tokens.textPrimary.copy(alpha = if (enabled) 0.85f else 0.25f))
    }
}

/** L'interrupteur Simple / Pro. */
@Composable
internal fun ModeSwitcher(mode: AudioEditorMode, onMode: (AudioEditorMode) -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Row(
        Modifier.clip(CircleShape).background(tokens.textPrimary.copy(alpha = 0.06f)).padding(MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        listOf(AudioEditorMode.SIMPLE to R.string.audio_editor_mode_simple, AudioEditorMode.PRO to R.string.audio_editor_mode_pro)
            .forEach { (target, label) ->
                val active = mode == target
                Text(
                    stringResource(label),
                    Modifier
                        .clip(CircleShape)
                        .background(if (active) MeeshyGradients.brand else androidx.compose.ui.graphics.SolidColor(Color.Transparent))
                        .semantics { role = Role.Tab; selected = active }
                        .clickable(enabled = !active) { haptics.light(); onMode(target) }
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
                    color = if (active) Color.White else tokens.textSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
    }
}

/** La bande d'outils : un rond de 50 dp par outil, le sélectionné en dégradé de marque. */
@Composable
internal fun AudioEditorToolStrip(
    tools: List<AudioEditorTool>,
    active: AudioEditorTool?,
    accent: Color,
    onSelect: (AudioEditorTool?) -> Unit,
) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        tools.forEach { tool ->
            val selected = tool == active
            Column(
                Modifier
                    .semantics(mergeDescendants = true) { role = Role.Tab; this.selected = selected }
                    .clickable { haptics.light(); onSelect(if (selected) null else tool) }
                    .padding(MeeshySpacing.xs),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Box(
                    Modifier
                        .size(50.dp)
                        .clip(CircleShape)
                        .background(if (selected) MeeshyGradients.brand else androidx.compose.ui.graphics.SolidColor(tokens.textPrimary.copy(alpha = 0.07f))),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(toolIcon(tool), null, Modifier.size(22.dp), tint = if (selected) Color.White else accent)
                }
                Text(
                    toolLabel(tool),
                    color = if (selected) tokens.textPrimary else tokens.textMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Le bouton du bas : « Appliquer » tant qu'un réglage est armé, « Utiliser l'audio » sinon. */
@Composable
internal fun AudioEditorBottomButton(canApply: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Box(
        Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyGradients.brand)
            .semantics { role = Role.Button }
            .clickable(enabled = enabled) { if (canApply) haptics.medium() else haptics.success(); onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            stringResource(if (canApply) R.string.audio_editor_apply else R.string.audio_editor_use),
            color = Color.White.copy(alpha = if (enabled) 1f else 0.5f),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** L'échec d'une édition, dit sans jargon ; la croix le ferme. */
@Composable
internal fun AudioEditorErrorBanner(error: AudioEditError, onDismiss: () -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val unreadable = error == AudioEditError.SourceUnreadable || error == AudioEditError.NoAudioTrack
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.smPlus))
            .background(tokens.error.copy(alpha = 0.1f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.Warning, null, Modifier.size(16.dp), tint = tokens.error)
        Text(
            stringResource(if (unreadable) R.string.audio_editor_error_load else R.string.audio_editor_error_generic),
            Modifier.weight(1f),
            color = tokens.textSecondary,
            fontSize = 13.sp,
        )
        Icon(
            MeeshyIcons.Close,
            stringResource(R.string.audio_editor_close),
            Modifier.size(24.dp).clickable(role = Role.Button, onClick = onDismiss).padding(4.dp),
            tint = tokens.textMuted,
        )
    }
}

/** Le voile « Traitement… » : il avale les touchers pendant que la nouvelle version se cuit. */
@Composable
internal fun AudioEditorProcessingOverlay(modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(Color.Black.copy(alpha = 0.35f))
            .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } } },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .clip(RoundedCornerShape(MeeshyRadius.lgPlus))
                .background(Color.Black.copy(alpha = 0.55f))
                .padding(MeeshySpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            CircularProgressIndicator(color = Color.White)
            Text(stringResource(R.string.audio_editor_processing), color = Color.White, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
    }
}
