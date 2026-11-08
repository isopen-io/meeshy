package me.meeshy.ui.component.refresh

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.PullIndicatorGeometry
import me.meeshy.sdk.model.chrome.PullRefreshPhase
import me.meeshy.ui.R
import me.meeshy.ui.component.auth.AnimatedBrandLogo
import me.meeshy.ui.component.auth.rememberAnimationsReduced
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Indicateur de marque du tirer-pour-rafraîchir (iOS `MeeshyPullIndicator`) : le logo Meeshy qui
 * tourne et grandit avec le tirage (180 ° au seuil), respire pendant le rafraîchissement dans un
 * anneau dégradé. Hauteur 0 au repos. Toute la géométrie vient de [PullIndicatorGeometry].
 */
@Composable
public fun MeeshyPullIndicator(
    phase: PullRefreshPhase,
    modifier: Modifier = Modifier,
) {
    val reduced = rememberAnimationsReduced()
    val spec = spring<Float>(dampingRatio = 0.85f, stiffness = 380f)
    val heightDp by animateFloatAsState(PullIndicatorGeometry.visibleHeightDp(phase), spec, label = "pullHeight")
    val opacity by animateFloatAsState(PullIndicatorGeometry.logoOpacity(phase), spec, label = "pullOpacity")
    val logoScale by animateFloatAsState(PullIndicatorGeometry.logoScale(phase), spec, label = "pullScale")
    val rotation by animateFloatAsState(PullIndicatorGeometry.logoRotationDegrees(phase), spec, label = "pullRotation")
    val mix = PullIndicatorGeometry.logoColorMix(phase)
    val logoColor = lerp(MeeshyPalette.Indigo300.copy(alpha = MeeshyOpacity.strong), MeeshyPalette.Indigo500, mix)
    val label = when (phase) {
        PullRefreshPhase.Armed -> stringResource(R.string.pull_refresh_armed)
        PullRefreshPhase.Refreshing -> stringResource(R.string.pull_refresh_refreshing)
        PullRefreshPhase.Completing -> stringResource(R.string.pull_refresh_done)
        else -> ""
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(heightDp.dp)
            .clipToBounds()
            .semantics { if (label.isNotEmpty()) liveRegion = LiveRegionMode.Polite; contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (PullIndicatorGeometry.showsRing(phase)) {
            PullRing(reduced)
        }
        AnimatedBrandLogo(
            modifier = Modifier
                .size(PullIndicatorGeometry.LOGO_SIZE_DP.dp)
                .graphicsLayer { alpha = opacity }
                .scale(logoScale)
                .rotate(rotation),
            color = logoColor,
            lineWidth = 3.5.dp,
            continuous = PullIndicatorGeometry.isContinuous(phase),
            reduceMotion = reduced,
        )
    }
}

@Composable
private fun PullRing(reduced: Boolean) {
    val turn by rememberInfiniteTransition(label = "pullRing").animateFloat(
        initialValue = 0f,
        targetValue = if (reduced) 0f else 360f,
        animationSpec = infiniteRepeatable(
            tween(PullIndicatorGeometry.RING_ROTATION_MILLIS, easing = LinearEasing),
            RepeatMode.Restart,
        ),
        label = "pullRingTurn",
    )
    Canvas(
        Modifier
            .size(PullIndicatorGeometry.RING_SIZE_DP.dp)
            .rotate(turn)
            .clearAndSetSemantics { },
    ) {
        drawCircle(
            brush = Brush.sweepGradient(
                listOf(
                    MeeshyPalette.Indigo500,
                    MeeshyPalette.Indigo700,
                    MeeshyPalette.Indigo500.copy(alpha = MeeshyOpacity.medium),
                    MeeshyPalette.Indigo500,
                ),
            ),
            style = Stroke(width = MeeshyBorder.strong.toPx(), cap = StrokeCap.Round),
        )
    }
}
