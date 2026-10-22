package me.meeshy.app.onboarding

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.feature.auth.R
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.meeshyText

/** Un gain de points. [id] distingue deux gains identiques consécutifs. */
@Immutable
internal data class OnboardingReward(val id: Long, val points: Int)

internal const val ONBOARDING_REWARD_FLIGHT_TAG = "onboarding.rewardFlight"
internal const val ONBOARDING_POINTS_CHIP_TAG = "onboarding.pointsChip"

/**
 * La pastille de points de la session : sparkles + nombre, ronde, au dégradé de la marque
 * (iOS `OnboardingPointsPill`). Le lecteur d'écran lit « N étincelles gagnées ».
 */
@Composable
internal fun OnboardingPointsChip(points: Int, bump: Boolean, modifier: Modifier = Modifier) {
    val resources = LocalContext.current.resources
    val pill = resources.getQuantityString(R.plurals.onboarding_points_pill, points, points)
    val description = resources.getQuantityString(R.plurals.onboarding_points_a11y, points, points)
    val scale by animateFloatAsState(
        targetValue = if (bump) 1.18f else 1f,
        animationSpec = if (bump) {
            spring(0.45f, MeeshyMotion.stiffnessForResponse(0.25f))
        } else {
            spring(0.7f, MeeshyMotion.stiffnessForResponse(0.4f))
        },
        label = "onboarding-chip-bump",
    )
    Row(
        modifier = modifier
            .testTag(ONBOARDING_POINTS_CHIP_TAG)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(8.dp, CircleShape, ambientColor = MeeshyPalette.Indigo500, spotColor = MeeshyPalette.Indigo500)
            .clip(CircleShape)
            .background(MeeshyGradients.brand)
            .heightIn(min = 36.dp)
            .padding(horizontal = MeeshySpacing.md)
            .clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(16.dp))
        Text(
            text = pill,
            color = MeeshyPalette.White,
            maxLines = 1,
            textAlign = TextAlign.Center,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.Bold, rounded = true),
        )
    }
}

/**
 * La pastille et, au gain, le « +N » qui MONTE vers elle (iOS `OnboardingOverlay.celebrate`) :
 * posé en calque de la pastille, il n'a aucune coordonnée à calculer et suit la pastille en RTL.
 * Annonce TalkBack et haptique de succès à chaque gain ; rebond de la pastille à l'arrivée.
 */
@Composable
internal fun OnboardingPointsCelebration(
    points: Int,
    reward: OnboardingReward?,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
    announce: (String) -> Unit = rememberOnboardingAnnouncer(),
    onSuccessHaptic: () -> Unit = rememberOnboardingSuccessHaptic(),
) {
    val resources = LocalContext.current.resources
    val progress = remember { Animatable(0f) }
    var flight by remember { mutableStateOf<OnboardingReward?>(null) }
    var bump by remember { mutableStateOf(false) }
    val currentAnnounce by rememberUpdatedState(announce)
    val currentHaptic by rememberUpdatedState(onSuccessHaptic)

    LaunchedEffect(reward) {
        val gained = reward ?: return@LaunchedEffect
        currentAnnounce(resources.getQuantityString(R.plurals.onboarding_reward_announce, gained.points, gained.points))
        currentHaptic()
        val spec = OnboardingMotionPolicy.flight(reduceMotion)
        progress.snapTo(0f)
        flight = gained
        launch {
            delay(spec.delayMillis.toLong())
            if (spec.bounces) {
                progress.animateTo(1f, spring(0.82f, MeeshyMotion.stiffnessForResponse(0.9f)))
            } else {
                progress.animateTo(1f, tween(spec.durationMillis, easing = FastOutSlowInEasing))
            }
        }
        delay(spec.clearAfterMillis)
        if (spec.bounces) {
            bump = true
            flight = null
            delay(200)
            bump = false
        } else {
            flight = null
        }
    }

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        OnboardingPointsChip(points = points, bump = bump)
        flight?.let { OnboardingRewardFlight(it, progress.value, reduceMotion) }
    }
}

@Composable
private fun OnboardingRewardFlight(reward: OnboardingReward, progress: Float, reduceMotion: Boolean) {
    val spec = OnboardingMotionPolicy.flight(reduceMotion)
    val density = LocalDensity.current
    val text = "+" + NumberFormat.getIntegerInstance().format(reward.points)
    Box(
        modifier = Modifier
            .wrapContentSize(unbounded = true)
            .testTag(ONBOARDING_REWARD_FLIGHT_TAG)
            .graphicsLayer {
                val offsetDp = spec.startOffsetDp + (spec.endOffsetDp - spec.startOffsetDp) * progress
                translationY = with(density) { offsetDp.dp.toPx() }
                val scale = spec.startScale + (spec.endScale - spec.startScale) * progress
                scaleX = scale
                scaleY = scale
                alpha = 1f - progress
                transformOrigin = TransformOrigin.Center
            }
            .clearAndSetSemantics {},
    ) {
        Text(
            text = text,
            maxLines = 1,
            softWrap = false,
            style = meeshyText(MeeshyFontSize.largeTitle, FontWeight.ExtraBold, rounded = true)
                .copy(brush = MeeshyGradients.brand),
        )
    }
}

@Composable
internal fun rememberOnboardingAnnouncer(): (String) -> Unit {
    val view = LocalView.current
    val announcer = remember(view) { AccessibilityAnnouncer.forView(view) }
    return remember(announcer) { { text: String -> announcer.announce(text) } }
}

@Composable
internal fun rememberOnboardingSuccessHaptic(): () -> Unit {
    val haptics = rememberMeeshyHaptics()
    return remember(haptics) { { haptics.success() } }
}
