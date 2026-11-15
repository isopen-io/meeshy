package me.meeshy.ui.component.comments

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.translate
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalLayoutDirection
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.SwipeReplyResistance
import me.meeshy.ui.component.bubble.BubbleBlurReveal
import me.meeshy.ui.component.bubble.BubbleBlurRevealSpec
import me.meeshy.ui.component.bubble.messageEffects
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import kotlin.math.roundToInt

/**
 * Glisser la ligne d'un commentaire vers la fin de lecture y répond (iOS `commentSwipeToReply`, #8582) : la ligne suit le
 * doigt (loi [SwipeReplyResistance]), la flèche « répondre » se révèle dans l'espace libéré et s'arme au seuil, le geste
 * reste annulable (revenir sous le seuil avant de relâcher ne déclenche rien). Le défilement vertical garde la main tant
 * que le geste n'est pas un glissé horizontal franc. Chaque surface de commentaire monte CE modificateur ET [CommentBody].
 */
@Composable
public fun Modifier.commentSwipeToReply(onReply: () -> Unit): Modifier {
    val offsetDp = remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val reversed = LocalLayoutDirection.current == LayoutDirection.Rtl
    val haptics = rememberMeeshyHaptics()
    val latestReply = rememberUpdatedState(onReply)
    val replyLabel = stringResource(me.meeshy.ui.R.string.fullscreen_reply)
    val arrow = rememberVectorPainter(MeeshyIcons.Reply)
    val restoring = remember { arrayOfNulls<Job>(1) }
    return this
        .semantics { customActions = listOf(CustomAccessibilityAction(replyLabel) { latestReply.value(); true }) }
        .drawBehind {
            val progress = SwipeReplyResistance.progress(offsetDp.floatValue)
            if (progress <= 0f) return@drawBehind
            val side = 22.dp.toPx() * (0.6f + 0.4f * progress)
            val armed = SwipeReplyResistance.repliesOnRelease(offsetDp.floatValue)
            val x = if (reversed) size.width - side - 4.dp.toPx() else 4.dp.toPx()
            translate(left = x, top = (size.height - side) / 2f) {
                with(arrow) {
                    draw(size = Size(side, side), alpha = if (armed) 1f else progress * 0.7f, colorFilter = ColorFilter.tint(MeeshyPalette.Indigo500))
                }
            }
        }
        .offset { IntOffset((offsetDp.floatValue * density.density * (if (reversed) -1 else 1)).roundToInt(), 0) }
        .pointerInput(reversed, density.density) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                restoring[0]?.cancel()
                var dx = 0f
                var dy = 0f
                var engaged = false
                var released = false
                var wasArmed = false
                while (true) {
                    val event = awaitPointerEvent()
                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                    if (!change.pressed) {
                        released = true
                        break
                    }
                    if (!engaged && change.isConsumed) break
                    val delta = change.positionChange()
                    dx += delta.x
                    dy += delta.y
                    val readingDx = (if (reversed) -dx else dx) / density.density
                    if (!engaged && SwipeReplyResistance.shouldEngage(readingDx, dy / density.density)) engaged = true
                    if (!engaged) continue
                    change.consume()
                    val tracked = SwipeReplyResistance.offset(readingDx)
                    offsetDp.floatValue = tracked
                    val armed = SwipeReplyResistance.repliesOnRelease(tracked)
                    if (armed && !wasArmed) haptics.light()
                    wasArmed = armed
                }
                val commits = released && engaged && SwipeReplyResistance.repliesOnRelease(offsetDp.floatValue)
                if (commits) {
                    latestReply.value()
                    haptics.success()
                }
                if (offsetDp.floatValue != 0f) {
                    restoring[0] = scope.launch {
                        animate(offsetDp.floatValue, 0f, animationSpec = spring(dampingRatio = 0.62f, stiffness = Spring.StiffnessMediumLow)) { value, _ ->
                            offsetDp.floatValue = value
                        }
                    }
                }
            }
        }
}

/**
 * Le CORPS d'un commentaire (texte + médias) avec ses effets (iOS `commentBody(effects:)`, #8582) : les effets d'apparition
 * et persistants par le MÊME rendu que les messages, et le voile du flou — on touche, on lit, ça se referme. L'auteur,
 * l'heure et les actions restent lisibles hors du corps. Sans effet, le corps est rendu tel quel.
 */
@Composable
public fun CommentBody(
    commentId: String,
    effects: MessageEffects,
    isBlurred: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    val dressed: @Composable () -> Unit = {
        Column(if (effects.hasPersistentEffect) Modifier.messageEffects(effects, shape = shape) else Modifier) { content() }
    }
    if (isBlurred) {
        BubbleBlurReveal(messageId = commentId, spec = BubbleBlurRevealSpec(isViewOnce = false), modifier = modifier, shape = shape) { dressed() }
    } else {
        Box(modifier) { dressed() }
    }
}
