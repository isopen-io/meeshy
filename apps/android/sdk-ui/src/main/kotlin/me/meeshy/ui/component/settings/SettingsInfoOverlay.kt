package me.meeshy.ui.component.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Fiche d'information d'un « i » : carte modale posée sur un voile, fermée d'un tap n'importe où
 * (haptique léger). N'anime pas quand les animations système sont coupées.
 */
@Composable
public fun SettingsInfoOverlay(info: SettingsInfo?, onDismiss: () -> Unit) {
    if (info == null) return
    val haptics = rememberMeeshyHaptics()
    val resolver = LocalContext.current.contentResolver
    val animate = remember(info) { SettingsInfoOverlayMotion.shouldAnimate(SettingsInfoOverlayMotion.systemScale(resolver)) }
    val dismiss = { haptics.light(); onDismiss() }
    val closeLabel = stringResource(R.string.common_close)
    val appeared = remember(info) { MutableTransitionState(!animate) }
    appeared.targetState = true

    Dialog(
        onDismissRequest = dismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClickLabel = closeLabel,
                    role = Role.Button,
                    onClick = dismiss,
                ),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visibleState = appeared,
                enter = if (animate) fadeIn() + scaleIn(initialScale = 0.96f) else androidx.compose.animation.EnterTransition.None,
            ) {
                InfoCard(info, closeLabel, dismiss)
            }
        }
    }
}

@Composable
private fun InfoCard(info: SettingsInfo, closeLabel: String, onClose: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val shape = RoundedCornerShape(MeeshyRadius.xxl)
    Column(
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.xxl)
            .widthIn(max = 420.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(tokens.backgroundSecondary, shape)
            .clickable(enabled = false, onClick = {})
            .padding(MeeshySpacing.xl),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = info.title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(text = info.message, style = MaterialTheme.typography.bodyMedium, color = tokens.textSecondary)
        TextButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
            Text(text = closeLabel, color = MeeshyPalette.Indigo500, fontWeight = FontWeight.SemiBold)
        }
    }
}
