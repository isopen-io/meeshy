package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.sp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallReactionEmoji
import kotlin.math.roundToInt

/** Une réaction en vol ; [lane] (0..LANES-1) répartit les émojis sur la largeur sans hasard. */
data class FloatingCallReaction(
    val id: Long,
    val emoji: CallReactionEmoji,
    val lane: Int,
)

object CallReactionOverlayLaw {
    const val LANES = 5
    const val RISE_MILLIS = 2_200
    const val FADE_MILLIS = 400

    /** Au plus [max] émojis simultanés : les plus anciens cèdent la place. */
    fun enqueue(current: List<FloatingCallReaction>, added: FloatingCallReaction, max: Int = 12): List<FloatingCallReaction> =
        (current + added).takeLast(max)

    fun remove(current: List<FloatingCallReaction>, id: Long): List<FloatingCallReaction> =
        current.filterNot { it.id == id }

    fun laneFor(sequence: Long): Int = (sequence % LANES).toInt()
}

/**
 * Les émojis de réaction montent depuis le bas de l'écran. Avec « Réduire les animations »
 * ([reduceMotion]), ils apparaissent sur place en fondu au lieu de monter.
 */
@Composable
fun CallReactionOverlay(
    reactions: List<FloatingCallReaction>,
    reduceMotion: Boolean,
    onFinished: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val heightPx = with(LocalDensity.current) { maxHeight.toPx() }
        val widthPx = with(LocalDensity.current) { maxWidth.toPx() }
        reactions.forEach { reaction ->
            androidx.compose.runtime.key(reaction.id) {
                FloatingReaction(reaction, heightPx, widthPx, reduceMotion, onFinished)
            }
        }
    }
}

@Composable
private fun FloatingReaction(
    reaction: FloatingCallReaction,
    heightPx: Float,
    widthPx: Float,
    reduceMotion: Boolean,
    onFinished: (Long) -> Unit,
) {
    val progress = remember(reaction.id) { Animatable(0f) }
    LaunchedEffect(reaction.id) {
        progress.animateTo(1f, tween(CallReactionOverlayLaw.RISE_MILLIS, easing = LinearEasing))
        onFinished(reaction.id)
    }
    val fadeIn = (progress.value * CallReactionOverlayLaw.RISE_MILLIS / CallReactionOverlayLaw.FADE_MILLIS).coerceAtMost(1f)
    val fadeOut = ((1f - progress.value) * CallReactionOverlayLaw.RISE_MILLIS / CallReactionOverlayLaw.FADE_MILLIS).coerceAtMost(1f)
    val laneX = (widthPx * (reaction.lane + 1) / (CallReactionOverlayLaw.LANES + 1)).roundToInt()
    val y = if (reduceMotion) (heightPx * 0.7f).roundToInt() else (heightPx * (1f - 0.7f * progress.value)).roundToInt()
    val description = stringResource(R.string.call_reaction_from, reaction.emoji.glyph)
    Box(Modifier.fillMaxSize()) {
        Text(
            text = reaction.emoji.glyph,
            fontSize = 36.sp,
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset { IntOffset(laneX, y) }
                .graphicsLayer { alpha = minOf(fadeIn, fadeOut) }
                .semantics { contentDescription = description },
        )
    }
}
