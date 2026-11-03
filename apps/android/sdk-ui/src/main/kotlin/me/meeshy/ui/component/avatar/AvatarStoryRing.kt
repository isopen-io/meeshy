package me.meeshy.ui.component.avatar

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyPalette

/** Durée (ms) d'un tour de l'anneau de story non lue. */
internal const val STORY_RING_TURN_MILLIS: Int = 4_000

/** L'anneau non lu tourne en continu seulement là où le contexte l'autorise ET hors « Réduire les animations ». */
internal fun storyRingRotates(state: StoryRingState, contextAnimates: Boolean, reduceMotion: Boolean): Boolean =
    state == StoryRingState.Unread && contextAnimates && !reduceMotion

/** Anneau de story : dégradé d'accent plein et épais si non lue (qui tourne hors listes), fin et estompé si lue. */
@Composable
internal fun AvatarStoryRing(
    state: StoryRingState,
    frame: Dp,
    width: Dp,
    accent: Color,
    rotates: Boolean,
) {
    when (state) {
        StoryRingState.None -> Unit
        StoryRingState.Read -> Box(Modifier.size(frame).border(width, accent.copy(alpha = 0.3f), CircleShape))
        StoryRingState.Unread -> {
            val brush = Brush.sweepGradient(listOf(MeeshyPalette.Indigo500, accent, MeeshyPalette.Indigo500))
            val angle = if (rotates) {
                val transition = rememberInfiniteTransition(label = "storyRing")
                val turn by transition.animateFloat(
                    initialValue = 0f, targetValue = 360f,
                    animationSpec = infiniteRepeatable(tween(STORY_RING_TURN_MILLIS, easing = LinearEasing), RepeatMode.Restart),
                    label = "storyRingTurn",
                )
                turn
            } else {
                0f
            }
            Box(Modifier.size(frame).graphicsLayer { rotationZ = angle }.border(width * 2, brush, CircleShape))
        }
    }
}
