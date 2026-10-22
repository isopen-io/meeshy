package me.meeshy.app.calls

import androidx.compose.animation.core.FastOutSlowInEasing
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
import androidx.compose.ui.unit.dp

private const val RING_COUNT = 4
private const val RING_MILLIS = 1_200
private const val RING_STAGGER_MILLIS = 200
private const val BOUNCE_MILLIS = 600

/**
 * Les quatre anneaux qui s'étendent autour de l'appelant et l'avatar qui rebondit (iOS
 * `IncomingCallView.ringAnimation`). Décoratif, coupé net sous « Réduire les animations ».
 */
@Composable
internal fun IncomingCallRings(
    name: String,
    avatarUrl: String?,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val bounce = if (reduceMotion) {
        1f
    } else {
        rememberInfiniteTransition(label = "incoming-bounce").animateFloat(
            initialValue = 1f,
            targetValue = 1.05f,
            animationSpec = infiniteRepeatable(
                animation = tween(BOUNCE_MILLIS, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "avatar-bounce",
        ).value
    }
    Box(modifier = modifier.clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        repeat(RING_COUNT) { index -> IncomingRing(index, reduceMotion) }
        CallAvatarDisc(
            name = name,
            size = 110.dp,
            avatarUrl = avatarUrl,
            modifier = Modifier.scale(bounce),
        )
    }
}

@Composable
private fun IncomingRing(index: Int, reduceMotion: Boolean) {
    val scale = if (reduceMotion) {
        1f
    } else {
        rememberInfiniteTransition(label = "incoming-ring-$index").animateFloat(
            initialValue = 0.8f,
            targetValue = 1.1f,
            animationSpec = infiniteRepeatable(
                animation = tween(RING_MILLIS),
                repeatMode = RepeatMode.Reverse,
                initialStartOffset = StartOffset(index * RING_STAGGER_MILLIS),
            ),
            label = "ring-$index",
        ).value
    }
    val fade = 1f - index * 0.15f
    Box(
        Modifier
            .size(120.dp + 35.dp * index)
            .scale(scale)
            .graphicsLayer { alpha = (if (reduceMotion) 0.85f else 0.6f) * fade }
            .border(
                BorderStroke(
                    (3f - index * 0.5f).coerceAtLeast(1f).dp,
                    Brush.linearGradient(
                        listOf(
                            CallPalette.Accept.copy(alpha = 0.4f - index * 0.08f),
                            CallPalette.Brand.copy(alpha = 0.2f - index * 0.04f),
                        ),
                    ),
                ),
                CircleShape,
            ),
    )
}
