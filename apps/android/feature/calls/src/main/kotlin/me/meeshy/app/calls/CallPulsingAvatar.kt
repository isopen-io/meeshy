package me.meeshy.app.calls

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.ui.appearance.AvatarRingLayer
import me.meeshy.ui.component.MeeshyAvatar

private const val PULSE_PEAK = 1.15f
private const val PULSE_MILLIS = 1_500
private const val PULSE_STAGGER_MILLIS = 300

/**
 * Le disque d'avatar de l'appel, entouré du contour que le correspondant a équipé (miroir
 * d'`avatarRingWithin` : le contour se pose DANS l'empreinte, rien ne grandit). `null` = disque nu.
 */
@Composable
internal fun CallAvatarDisc(
    name: String,
    size: Dp,
    avatarUrl: String?,
    modifier: Modifier = Modifier,
    ring: AvatarRingDesign? = null,
) {
    AvatarRingLayer(design = ring, footprint = size, modifier = modifier.size(size)) {
        CallAvatarPhoto(name = name, size = size, avatarUrl = avatarUrl)
    }
}

/** Le disque nu : l'atome central, UN visage (photo OU initiales), sur le dégradé de l'appel. */
@Composable
private fun CallAvatarPhoto(name: String, size: Dp, avatarUrl: String?) {
    MeeshyAvatar(
        name = name,
        size = size,
        containerColor = CallPalette.BrandDeep,
        secondaryColor = CallPalette.Brand,
        contentColor = CallPalette.Ink,
        imageUrl = avatarUrl,
    )
}

/**
 * L'avatar du contact entouré de trois anneaux qui pulsent (iOS `pulsingAvatar`). Décoratif :
 * le nom est lu par le texte qui le suit. Sous « Réduire les animations » les anneaux restent
 * posés, sans boucle.
 */
@Composable
internal fun CallPulsingAvatar(
    name: String,
    peer: CallPeerVisual,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
    avatarSize: Dp = 100.dp,
) {
    Box(
        modifier = modifier.clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        repeat(RING_COUNT) { index -> PulseRing(index = index, avatarSize = avatarSize, reduceMotion = reduceMotion) }
        CallAvatarDisc(name = name, size = avatarSize, avatarUrl = peer.avatarUrl, ring = peer.ring)
    }
}


private const val RING_COUNT = 3

/** Un anneau : il respire de 1 à 1,15, décalé de 0,3 s par rang ; posé à 1 sans boucle sous réduction de mouvement. */
@Composable
private fun PulseRing(index: Int, avatarSize: Dp, reduceMotion: Boolean) {
    val scale = if (reduceMotion) {
        1f
    } else {
        rememberInfiniteTransition(label = "call-pulse-$index").animateFloat(
            initialValue = 1f,
            targetValue = PULSE_PEAK,
            animationSpec = infiniteRepeatable(
                animation = tween(PULSE_MILLIS, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
                initialStartOffset = StartOffset(index * PULSE_STAGGER_MILLIS),
            ),
            label = "ring-$index",
        ).value
    }
    Box(
        Modifier
            .size(avatarSize + 20.dp + 30.dp * index)
            .scale(scale)
            .graphicsLayer { alpha = (2f - scale * 0.8f).coerceIn(0f, 1f) }
            .border(
                BorderStroke(
                    2.dp,
                    Brush.linearGradient(
                        listOf(CallPalette.BrandDeep.copy(alpha = 0.4f), CallPalette.Brand.copy(alpha = 0.2f)),
                    ),
                ),
                CircleShape,
            ),
    )
}
