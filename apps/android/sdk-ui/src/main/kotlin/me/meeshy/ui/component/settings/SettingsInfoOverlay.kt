package me.meeshy.ui.component.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.motion.meeshyEnter
import me.meeshy.ui.motion.meeshyExit
import me.meeshy.ui.motion.rememberHeldPresence
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Fiche d'information d'un « i » : carte modale posée sur un voile, fermée d'un tap n'importe où (haptique léger).
 * Fermée, la fenêtre reste ouverte le temps de sa sortie (voile et carte en fondu, la carte à 0,96), puis [onDismiss]
 * part ; un second toucher pendant la sortie ne rejoue rien. Une fiche retirée par l'hôte sort de la même façon. Sous
 * « Réduire les animations » ([LocalReduceMotion]) : le fondu court seul.
 */
@Composable
public fun SettingsInfoOverlay(info: SettingsInfo?, onDismiss: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val reduce = LocalReduceMotion.current
    var dismissed by remember(info) { mutableStateOf(false) }
    val presence = rememberHeldPresence(info.takeUnless { dismissed }, animateFirstAppearance = true)
    val visibility = presence.visibleState
    val leave by rememberUpdatedState(newValue = { if (dismissed) onDismiss() })
    LaunchedEffect(presence.visibleState) {
        snapshotFlow { presence.isGone }.collect { gone -> if (gone) leave() }
    }
    val shown = presence.value ?: return
    if (presence.isGone) return
    val dismiss = {
        if (!dismissed) {
            haptics.light()
            dismissed = true
        }
    }
    val closeLabel = stringResource(R.string.common_close)

    Dialog(
        onDismissRequest = dismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        AnimatedVisibility(
            visibleState = visibility,
            enter = meeshyEnter(reduce, fadeIn(MeeshyMotion.springDefault())),
            exit = meeshyExit(reduce, fadeOut(MeeshyMotion.springDefault())),
            label = "settings-info-overlay",
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
                InfoCard(
                    info = shown,
                    closeLabel = closeLabel,
                    onClose = dismiss,
                    modifier = Modifier.animateEnterExit(
                        enter = if (reduce) EnterTransition.None else scaleIn(MeeshyMotion.springDefault(), initialScale = CARD_SCALE),
                        exit = if (reduce) ExitTransition.None else scaleOut(MeeshyMotion.springDefault(), targetScale = CARD_SCALE),
                    ),
                )
            }
        }
    }
}

private const val CARD_SCALE: Float = 0.96f

@Composable
private fun InfoCard(info: SettingsInfo, closeLabel: String, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val shape = RoundedCornerShape(MeeshyRadius.xxl)
    Column(
        modifier = modifier
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
