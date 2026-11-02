package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import kotlin.math.roundToInt
import kotlin.math.sign
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.bubble.BubbleGestureArbiter
import me.meeshy.ui.component.bubble.LocalBubbleGestureArbiter
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Wraps a message bubble with the two-way swipe of iOS `BubbleSwipeContainer`: the side that
 * points back at the sender REPLIES (received → right, mine → left), the opposite side FORWARDS.
 * While the row slides, the edge it frees shows the message's day + time; past the threshold the
 * stamp gives way to the reply / forward glyph in the brand colour, a light haptic marks the
 * crossing and releasing there commits with a success haptic. The decisions live in the pure
 * [SwipeRowLaw]; this is the exempt Compose gesture glue.
 *
 * A null [onReply] / [onForward] means the message's law refuses that side ([MessageRowOffer],
 * #12760): that side only slides far enough to read the stamp. With neither side offered the
 * gesture is not mounted at all. The tree keeps its shape either way.
 *
 * The bubble's widgets can make the swipe stand down through the [BubbleGestureArbiter] provided
 * to [content] (a media scrubber, an open carousel): a drag that starts — or continues — while
 * any of them holds a claim neither moves the bubble nor acts.
 */
@Composable
internal fun SwipeRowContainer(
    isOutgoing: Boolean,
    createdAtIso: String?,
    resistance: SwipeResistance,
    onReply: (() -> Unit)?,
    onForward: (() -> Unit)?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val direction = replyDirection(isOutgoing)
    val haptics = rememberMeeshyHaptics()
    val isRtl = rememberIsRtl()
    val density = LocalDensity.current
    val currentOnReply by rememberUpdatedState(onReply)
    val currentOnForward by rememberUpdatedState(onForward)
    val sides = SwipeRowSides(canReply = onReply != null, canForward = onForward != null)
    val currentSides by rememberUpdatedState(sides)
    val swipeMounted = sides.armsAnySide
    var swipe by remember { mutableStateOf(SwipeRowState()) }
    val offsetDp = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val arbiter = remember { BubbleGestureArbiter() }
    LaunchedEffect(swipeMounted) {
        if (!swipeMounted) {
            swipe = SwipeRowState()
            offsetDp.snapTo(0f)
        }
    }
    val returnSpring = remember {
        spring<Float>(dampingRatio = 0.62f, stiffness = MeeshyMotion.stiffnessForResponse(0.42f))
    }
    val shownOffset = offsetDp.value

    Box(modifier = modifier.fillMaxWidth()) {
        if (swipeMounted) {
            SwipeIndicator(
                offset = shownOffset,
                showsGlyph = SwipeRowLaw.showsActionGlyph(shownOffset, direction, sides),
                action = SwipeRowLaw.sideOf(shownOffset, direction),
                createdAtIso = createdAtIso,
                modifier = Modifier.align(
                    when (SwipeRowLaw.indicatorEdge(shownOffset)) {
                        SwipeIndicatorEdge.Start -> Alignment.CenterStart
                        SwipeIndicatorEdge.End -> Alignment.CenterEnd
                    },
                ),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset {
                    val px = with(density) { swipeReadingDelta(offsetDp.value, isRtl).dp.toPx() }
                    IntOffset(px.roundToInt(), 0)
                }
                .then(
                    if (!swipeMounted) {
                        Modifier
                    } else {
                        Modifier.pointerInput(direction, isRtl, resistance) {
                            var start = Offset.Zero
                            var rawPx = 0f
                            var firstStep = true
                            var yielding = false
                            var engaged = false
                            fun settle() {
                                rawPx = 0f
                                engaged = false
                                swipe = SwipeRowState()
                                scope.launch { offsetDp.animateTo(0f, returnSpring) }
                            }
                            detectHorizontalDragGestures(
                                onDragStart = { at ->
                                    start = at
                                    rawPx = 0f
                                    firstStep = true
                                    engaged = false
                                    yielding = arbiter.suppressSwipe
                                },
                                onDragCancel = { settle() },
                                onDragEnd = {
                                    val action = if (yielding) {
                                        null
                                    } else {
                                        SwipeRowLaw.committed(swipe.offset, direction, currentSides)
                                    }
                                    when (action) {
                                        SwipeRowAction.Reply -> currentOnReply?.invoke()
                                        SwipeRowAction.Forward -> currentOnForward?.invoke()
                                        null -> Unit
                                    }
                                    if (action != null) haptics.success()
                                    settle()
                                },
                                onHorizontalDrag = { change, dragAmount ->
                                    if (yielding || arbiter.suppressSwipe) {
                                        // A widget of the bubble owns this drag: stand down.
                                        if (!yielding) settle()
                                        yielding = true
                                    } else {
                                        // The slop the detector swallowed belongs to the translation (iOS
                                        // measures from the touch-down): give it back on the first step.
                                        val step = if (firstStep) {
                                            dragAmount + sign(dragAmount) * viewConfiguration.touchSlop
                                        } else {
                                            dragAmount
                                        }
                                        firstStep = false
                                        rawPx += step
                                        val dxDp = swipeReadingDelta(rawPx, isRtl) / density.density
                                        val dyDp = (change.position.y - start.y) / density.density
                                        if (engaged || SwipeRowLaw.shouldEngage(dxDp, dyDp, resistance)) {
                                            engaged = true
                                            val drag = SwipeRowLaw.onDrag(swipe, dxDp, direction, currentSides)
                                            if (drag.armedHaptic) haptics.light()
                                            swipe = drag.state
                                            scope.launch { offsetDp.snapTo(drag.state.offset) }
                                        }
                                        change.consume()
                                    }
                                },
                            )
                        }
                    },
                ),
        ) {
            CompositionLocalProvider(LocalBubbleGestureArbiter provides arbiter) {
                content()
            }
        }
    }
}

/**
 * The 64 dp column revealed on the freed edge: the message's day + time under the threshold, the
 * reply / forward glyph past it (cross-faded in 150 ms), fading in from 8 dp to full at 24 dp.
 */
@Composable
private fun SwipeIndicator(
    offset: Float,
    showsGlyph: Boolean,
    action: SwipeRowAction?,
    createdAtIso: String?,
    modifier: Modifier = Modifier,
) {
    val alpha = SwipeRowLaw.indicatorAlpha(offset)
    if (alpha <= 0f) return
    val stamp = rememberSwipeStamp(createdAtIso)
    Box(
        modifier = modifier
            .padding(horizontal = MeeshySpacing.sm)
            .width(64.dp)
            .graphicsLayer { this.alpha = alpha },
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = if (showsGlyph) action else null,
            transitionSpec = {
                (fadeIn(tween(150)) + scaleIn(tween(150), initialScale = 0.6f)) togetherWith
                    (fadeOut(tween(150)) + scaleOut(tween(150), targetScale = 0.6f))
            },
            contentAlignment = Alignment.Center,
            label = "swipe-indicator",
        ) { glyph ->
            when (glyph) {
                SwipeRowAction.Reply, SwipeRowAction.Forward -> Icon(
                    imageVector = if (glyph == SwipeRowAction.Reply) MeeshyIcons.Reply else MeeshyIcons.ForwardMessage,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(MeeshyIconSize.xxl),
                )
                null -> if (stamp != null) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = stamp.first,
                            fontSize = MeeshyFontSize.footnote,
                            fontWeight = FontWeight.Medium,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 1,
                        )
                        Text(
                            text = stamp.second,
                            fontSize = MeeshyFontSize.small,
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/** « 26 oct. » / « 14:05 » for the message, formatted once per message and locale. */
@Composable
private fun rememberSwipeStamp(createdAtIso: String?): Pair<String, String>? {
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0]
    return remember(createdAtIso, locale) {
        val millis = isoToEpochMillisOrNull(createdAtIso) ?: return@remember null
        val date = Date(millis)
        val dayPattern = android.text.format.DateFormat.getBestDateTimePattern(locale, "dMMM")
        val day = SimpleDateFormat(dayPattern, locale).format(date)
        val time = android.text.format.DateFormat.getTimeFormat(context).format(date)
        day to time
    }
}
