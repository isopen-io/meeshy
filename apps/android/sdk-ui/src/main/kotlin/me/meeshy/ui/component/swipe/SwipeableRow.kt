package me.meeshy.ui.component.swipe

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.matchParentSize
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.GenericShape
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.Alignment
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.chrome.SwipeRowFrame
import me.meeshy.sdk.model.chrome.SwipeRowLaw
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyTheme
import kotlin.math.abs
import kotlin.math.roundToInt

/** Assez pour toute rangee de liste : le rognage ne vaut que sur l'axe du glissement (iOS #10835). */
private const val VERTICAL_REACH_PX = 10_000f

private val HorizontalOnlyClip = GenericShape { size, _ ->
    addRect(Rect(0f, -VERTICAL_REACH_PX, size.width, size.height + VERTICAL_REACH_PX))
}

/**
 * Rangee glissante persistante (iOS `SwipeableRow`) : glisser revele jusqu'a trois actions par cote, la
 * ligne RESTE ouverte (plus de retour automatique), une seule ligne l'est a la fois ([coordinator]), et un
 * toucher hors d'elle, le defilement ou la sortie de l'ecran la referment. Le geste suit le sens de lecture
 * (RTL inverse), les actions sont aussi exposees en actions personnalisees TalkBack, et l'ouverture donne un
 * retour haptique.
 */
@Composable
public fun SwipeableRow(
    modifier: Modifier = Modifier,
    leadingActions: List<SwipeAction> = emptyList(),
    trailingActions: List<SwipeAction> = emptyList(),
    coordinator: SwipeRowCoordinator = LocalSwipeRowCoordinator.current,
    content: @Composable () -> Unit,
) {
    val leading = SwipeRowLaw.capped(leadingActions)
    val trailing = SwipeRowLaw.capped(trailingActions)
    val leadingWidth = leading.size * SwipeRowLaw.ACTION_WIDTH_DP
    val trailingWidth = trailing.size * SwipeRowLaw.ACTION_WIDTH_DP
    val density = LocalDensity.current.density
    val direction = if (LocalLayoutDirection.current == LayoutDirection.Rtl) -1f else 1f
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    val id = remember { Any() }
    var openOffset by remember { mutableFloatStateOf(0f) }
    var position by remember { mutableFloatStateOf(0f) }
    val settle = remember { arrayOfNulls<Job>(1) }
    val lastTop = remember { floatArrayOf(Float.NaN) }
    val lastFrame = remember { arrayOfNulls<SwipeRowFrame>(1) }

    fun settleTo(target: Float) {
        settle[0]?.cancel()
        openOffset = target
        if (reduceMotion) {
            position = target
            return
        }
        settle[0] = scope.launch {
            animate(
                initialValue = position,
                targetValue = target,
                animationSpec = spring(dampingRatio = 0.74f, stiffness = Spring.StiffnessMediumLow),
            ) { value, _ -> position = value }
        }
    }

    fun close() {
        coordinator.rowDidClose(id)
        settleTo(0f)
    }

    fun open(target: Float) {
        coordinator.rowDidOpen(id) { settleTo(0f) }
        lastFrame[0]?.let { coordinator.rowFrameDidChange(id, it) }
        settleTo(target)
    }

    val isOpen = openOffset != 0f
    val isDisplaced by remember { derivedStateOf { position != 0f } }
    val displacedBackground = MeeshyTheme.tokens.backgroundPrimary
    val activity = LocalContext.current.findActivity()
    DisposableEffect(id) { onDispose { coordinator.rowDidClose(id) } }
    DisposableEffect(isOpen, activity) {
        val unregister = if (isOpen && activity != null) {
            SwipeWindowTouchObserver.register(activity.window) { x, y -> coordinator.touchBegan(x, y) }
        } else {
            null
        }
        onDispose { unregister?.invoke() }
    }

    val dragState = rememberDraggableState { deltaPx -> position += direction * deltaPx / density }
    val allActions = leading + trailing
    val accessibilityActions = allActions.map { action ->
        CustomAccessibilityAction(action.label) {
            action.onClick()
            close()
            true
        }
    }

    Box(
        modifier = modifier
            .clip(HorizontalOnlyClip)
            .onGloballyPositioned { coordinates ->
                val bounds = coordinates.boundsInWindow()
                val frame = SwipeRowFrame(bounds.left, bounds.top, bounds.right, bounds.bottom)
                lastFrame[0] = frame
                if (openOffset != 0f) {
                    coordinator.rowFrameDidChange(id, frame)
                    val previous = lastTop[0]
                    if (!previous.isNaN() && abs(previous - bounds.top) > 1f) close()
                }
                lastTop[0] = bounds.top
            },
    ) {
        SwipeActionBackground(
            leading = leading,
            trailing = trailing,
            leadingWidth = leadingWidth,
            trailingWidth = trailingWidth,
            offsetProvider = { SwipeRowLaw.effectiveOffset(openOffset, position - openOffset, leadingWidth, trailingWidth) },
            onTriggered = ::close,
            modifier = Modifier.matchParentSize(),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset {
                    val logical = SwipeRowLaw.effectiveOffset(openOffset, position - openOffset, leadingWidth, trailingWidth)
                    IntOffset((logical * direction * density).roundToInt(), 0)
                }
                .then(if (isDisplaced) Modifier.background(displacedBackground) else Modifier)
                .draggable(
                    state = dragState,
                    orientation = Orientation.Horizontal,
                    onDragStarted = { settle[0]?.cancel() },
                    onDragStopped = { velocityPx ->
                        val target = SwipeRowLaw.resolveRelease(
                            openOffset = openOffset,
                            translation = position - openOffset,
                            velocity = direction * velocityPx / density,
                            leadingWidth = leadingWidth,
                            trailingWidth = trailingWidth,
                        )
                        when {
                            target == openOffset -> settleTo(target)
                            target == 0f -> {
                                haptics.light()
                                close()
                            }
                            else -> {
                                haptics.light()
                                open(target)
                            }
                        }
                    },
                )
                .then(
                    if (accessibilityActions.isEmpty()) {
                        Modifier
                    } else {
                        Modifier.semantics(mergeDescendants = true) { customActions = accessibilityActions }
                    },
                ),
        ) {
            content()
            if (isOpen) {
                Box(
                    Modifier
                        .matchParentSize()
                        .pointerInput(Unit) { detectTapGestures { close() } },
                )
            }
        }
    }
}

@Composable
private fun SwipeActionBackground(
    leading: List<SwipeAction>,
    trailing: List<SwipeAction>,
    leadingWidth: Float,
    trailingWidth: Float,
    offsetProvider: () -> Float,
    onTriggered: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val offset = offsetProvider()
    if (offset == 0f) return
    Box(modifier = modifier) {
        if (offset > 0f && leadingWidth > 0f) {
            Row(Modifier.align(Alignment.CenterStart).fillMaxHeight()) {
                leading.forEachIndexed { index, action ->
                    SwipeActionCell(action, SwipeRowLaw.cellProgress(offset, index), onTriggered)
                }
            }
        }
        if (offset < 0f && trailingWidth > 0f) {
            Row(Modifier.align(Alignment.CenterEnd).fillMaxHeight()) {
                trailing.indices.reversed().forEach { index ->
                    SwipeActionCell(trailing[index], SwipeRowLaw.cellProgress(-offset, index), onTriggered)
                }
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
