package me.meeshy.app.chat

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt
import me.meeshy.ui.component.bubble.BubbleGestureArbiter
import me.meeshy.ui.component.bubble.LocalBubbleGestureArbiter
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Wraps a message bubble with the swipe-to-reply gesture. The bubble tracks the
 * finger toward its reply direction (incoming → right, own → left) with the
 * rubber-banded resistance of [SwipeToReply], revealing a reply glyph behind it,
 * and fires [onReply] with a haptic once released past the commit threshold. The
 * "when to arm / when to commit" product decision is the pure [SwipeToReply]
 * core; this is the exempt Compose gesture glue.
 *
 * The bubble's widgets can make the swipe stand down through the [BubbleGestureArbiter] provided
 * to [content] (a media scrubber, an open carousel, a selection): a drag that starts — or
 * continues — while any of them holds a claim neither moves the bubble nor replies.
 */
@Composable
internal fun SwipeToReplyContainer(
    isOutgoing: Boolean,
    accentColor: Color,
    onReply: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val direction = replyDirection(isOutgoing)
    val haptic = LocalHapticFeedback.current
    val isRtl = rememberIsRtl()
    var swipe by remember { mutableStateOf(SwipeReplyState()) }
    var rawTranslation by remember { mutableStateOf(0f) }
    val arbiter = remember { BubbleGestureArbiter() }
    var yielding by remember { mutableStateOf(false) }
    val animatedOffset by animateFloatAsState(
        targetValue = swipe.offset,
        label = "swipe-to-reply-offset",
    )
    val revealProgress = (abs(animatedOffset) / SwipeToReply.COMMIT_THRESHOLD).coerceIn(0f, 1f)

    Box(modifier = modifier.fillMaxWidth()) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Reply,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier
                .align(if (isOutgoing) Alignment.CenterEnd else Alignment.CenterStart)
                .padding(horizontal = MeeshySpacing.lg)
                .size(24.dp)
                .alpha(revealProgress),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(swipeReadingDelta(animatedOffset, isRtl).roundToInt(), 0) }
                .pointerInput(direction, isRtl) {
                    detectHorizontalDragGestures(
                        onDragStart = {
                            rawTranslation = 0f
                            yielding = arbiter.suppressSwipe
                        },
                        onDragCancel = {
                            rawTranslation = 0f
                            swipe = SwipeReplyState()
                        },
                        onDragEnd = {
                            if (!yielding && SwipeToReply.onRelease(swipe, direction) == SwipeReplyRelease.Commit) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onReply()
                            }
                            rawTranslation = 0f
                            swipe = SwipeReplyState()
                        },
                        onHorizontalDrag = { change, dragAmount ->
                            if (yielding || arbiter.suppressSwipe) {
                                // A widget of the bubble owns this drag: stand down.
                                yielding = true
                                rawTranslation = 0f
                                swipe = SwipeReplyState()
                            } else {
                                rawTranslation += swipeReadingDelta(dragAmount, isRtl)
                                val drag = SwipeToReply.onDrag(swipe, rawTranslation, direction)
                                if (drag.armedHaptic) {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                }
                                swipe = drag.state
                                change.consume()
                            }
                        },
                    )
                },
        ) {
            CompositionLocalProvider(LocalBubbleGestureArbiter provides arbiter) {
                content()
            }
        }
    }
}
