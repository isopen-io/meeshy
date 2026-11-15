package me.meeshy.app.auth

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.ArrivalCelebrationMotion
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.auth.FireworksCanvas
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Durée du fondu sous animations réduites (le feu d'artifice est alors remplacé par un simple fondu). */
internal const val ARRIVAL_FADE_MS: Int = 300

/**
 * « Adresse confirmée ! » (miroir d'`ArrivalCelebrationView`, iOS) : l'adresse est prouvée, la session ouverte ;
 * l'écran fête l'instant pendant que les caches se remplissent. Un feu d'artifice dessiné en Canvas, ou, sous
 * animations réduites, un fondu de 300 ms sans particule. Toucher l'écran, ou l'action d'accessibilité
 * « Continuer », passe la fête ([onContinue]) ; la haptique de succès et l'annonce TalkBack partent à l'apparition.
 */
@Composable
fun ArrivalCelebrationScreen(onContinue: () -> Unit, modifier: Modifier = Modifier) {
    val motion = ArrivalCelebrationMotion.of(reduceMotion = LocalReduceMotion.current)
    val tokens = MeeshyTheme.tokens
    var appeared by remember { mutableStateOf(false) }
    val appearance by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = if (motion.showsParticles) FIREWORKS_APPEAR_MS else ARRIVAL_FADE_MS),
        label = "arrival-appearance",
    )
    val haptics = rememberMeeshyHaptics()
    val view = LocalView.current
    val status = stringResource(R.string.arrival_celebration_status)
    val skip = stringResource(R.string.arrival_celebration_skip)
    LaunchedEffect(Unit) {
        appeared = true
        if (motion.showsParticles) haptics.success()
        view.announceForAccessibility(status)
    }
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onContinue)
            .semantics { customActions = listOf(CustomAccessibilityAction(skip) { onContinue(); true }) },
    ) {
        if (motion.showsParticles) FireworksCanvas()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = MeeshySpacing.xl)
                .alpha(appearance),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(104.dp)
                    .scale(if (motion.showsParticles) 0.4f + 0.6f * appearance else 1f)
                    .clip(CircleShape)
                    .background(tokens.success.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = MeeshyIcons.CheckCircleFilled,
                    contentDescription = null,
                    tint = tokens.success,
                    modifier = Modifier.size(56.dp),
                )
            }
            Text(
                text = stringResource(R.string.arrival_celebration_title),
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.arrival_celebration_lead),
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    }
}

private const val FIREWORKS_APPEAR_MS: Int = 550
