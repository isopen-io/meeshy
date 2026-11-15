package me.meeshy.app.feed

import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.feed.FeedHaloTone
import me.meeshy.sdk.model.feed.FeedOverlayAppearance
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Les deux halos du Flux (iOS `ThemedFeedOverlay` : indigo400 300 pt flou 80, erreur 250 pt flou 70), à 6-10 %
 * d'opacité, qui dérivent lentement. Décor pur, masqué à l'accessibilité. Sous « Réduire les animations » aucune
 * transition infinie n'est créée : les halos restent à leur place de repos.
 */
@Composable
internal fun BoxScope.FeedAmbientHalos(isDark: Boolean, reduceMotion: Boolean = LocalReduceMotion.current) {
    val phase = rememberDriftPhase(reduceMotion)
    val halos = remember(isDark) { FeedOverlayAppearance.halos(isDark) }
    halos.forEachIndexed { index, halo ->
        val drift = FeedOverlayAppearance.drift(index, phase.value, reduceMotion)
        Box(
            Modifier
                .align(Alignment.Center)
                .offset(x = (halo.offsetXDp + drift.first).dp, y = (halo.offsetYDp + drift.second).dp)
                .size(halo.sizeDp.dp)
                .blur(halo.blurDp.dp, edgeTreatment = BlurredEdgeTreatment.Unbounded)
                .background(halo.tone.color().copy(alpha = halo.alpha), CircleShape)
                .clearAndSetSemantics { },
        )
    }
}

@Composable
private fun rememberDriftPhase(reduceMotion: Boolean): State<Float> =
    if (reduceMotion) {
        remember { mutableStateOf(0.5f) }
    } else {
        rememberInfiniteTransition(label = "feedHaloDrift").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(FeedOverlayAppearance.DRIFT_PERIOD_MILLIS, easing = EaseInOut),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "feedHaloDriftPhase",
        )
    }

private fun FeedHaloTone.color(): Color = when (this) {
    FeedHaloTone.INDIGO_400 -> MeeshyPalette.Indigo400
    FeedHaloTone.ERROR -> MeeshyPalette.Error
}
