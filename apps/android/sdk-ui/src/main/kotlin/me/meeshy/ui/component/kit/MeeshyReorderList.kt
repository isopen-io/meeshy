package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.zIndex
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val ROW_SPACING_DP = 8
private const val ROW_PADDING_DP = 12
private const val NO_INDEX = -1

/**
 * Les mots du réglage de l'ordre, déjà traduits : les actions de la voix (une par déplacement permis) et l'annonce qui suit
 * un déplacement, la même pour le doigt, la voix et le clavier.
 */
public data class MeeshyReorderLabels(
    val up: String,
    val down: String,
    val toStart: String,
    val toEnd: String,
    val moved: (item: String, position: Int, count: Int) -> String,
) {
    internal fun of(move: MeeshyReorderMove): String = when (move) {
        MeeshyReorderMove.Up -> up
        MeeshyReorderMove.Down -> down
        MeeshyReorderMove.ToStart -> toStart
        MeeshyReorderMove.ToEnd -> toEnd
    }
}

/**
 * **La liste réordonnable** (K52) : tout ordre réglable au doigt l'est aussi sans le doigt. Le glisser (appui long sur la
 * poignée), les actions de la voix (monter, descendre, tout en haut, tout en bas) et Alt + flèches du clavier appellent le MÊME
 * [onMove] `(from, to)`, avec les mêmes bornes et la même annonce. Le composant porte le geste et rend deux index ; le contenu
 * de la rangée ([row]), l'enregistrement de l'ordre et son retour arrière sont à l'hôte (mise à jour optimiste, annulation si
 * le réseau refuse). Les autres rangées s'écartent pendant le vol. Jumeau iOS : `MeeshyReorderList`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod")
public fun <T> MeeshyReorderList(
    items: List<T>,
    itemLabel: (T) -> String,
    labels: MeeshyReorderLabels,
    onMove: (from: Int, to: Int) -> Unit,
    modifier: Modifier = Modifier,
    rank: MeeshyReorderRank = MeeshyReorderRank.Hidden,
    emphasizesFirst: Boolean = false,
    handleEdge: MeeshyReorderHandleEdge = MeeshyReorderHandleEdge.Trailing,
    enabled: Boolean = true,
    pending: Set<Int> = emptySet(),
    tint: Color = MeeshyPalette.Indigo500,
    row: @Composable (item: T, index: Int) -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val reduce = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val view = LocalView.current
    val density = LocalDensity.current
    val spacingPx = with(density) { ROW_SPACING_DP.dp.toPx() }
    val heights = remember { mutableStateListOf<Float>() }
    var grabbed by remember { mutableIntStateOf(NO_INDEX) }
    var offset by remember { mutableFloatStateOf(0f) }
    val sizes = heights.toList().let { if (it.size == items.size) it else List(items.size) { index -> it.getOrElse(index) { 0f } } }
    val target = if (grabbed == NO_INDEX) NO_INDEX else MeeshyReorderListRecipe.targetIndex(grabbed, offset, sizes, spacingPx)

    val latestItems by rememberUpdatedState(items)
    val latestMove by rememberUpdatedState(onMove)
    val latestLabel by rememberUpdatedState(itemLabel)
    val latestLabels by rememberUpdatedState(labels)

    fun commit(from: Int, to: Int) {
        val current = latestItems
        if (from !in current.indices) return
        val destination = to.coerceIn(0, current.lastIndex)
        if (destination == from) return
        latestMove(from, destination)
        view.announceForAccessibility(latestLabels.moved(latestLabel(current[from]), destination + 1, current.size))
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ROW_SPACING_DP.dp)) {
        items.forEachIndexed { index, item ->
            val isGrabbed = index == grabbed
            val values = MeeshyReorderListRecipe.resolve(
                phase = if (isGrabbed) MeeshyReorderPhase.Flying else MeeshyReorderPhase.Rest,
                rank = rank,
                isFirst = index == 0,
                emphasizesFirst = emphasizesFirst,
                isEnabled = enabled,
                isPending = index in pending,
                handleEdge = handleEdge,
                reduceMotion = reduce,
            )
            val shift = siblingShift(index, grabbed, target, sizes.getOrElse(grabbed.coerceAtLeast(0)) { 0f } + spacingPx)
            val shifted by animateFloatAsState(if (reduce) 0f else shift, label = "reorder-shift")
            val scale by animateFloatAsState(values.scale, label = "reorder-scale")
            val moves = if (enabled) MeeshyReorderListRecipe.voiceMoves(index, items.size) else emptyList()
            val handle = @Composable {
                ReorderHandle(values, enabled, tokens.textMuted, Modifier.pointerInput(index, enabled, items.size) {
                    if (!enabled) return@pointerInput
                    detectDragGesturesAfterLongPress(
                        onDragStart = {
                            grabbed = index
                            offset = 0f
                            haptics.medium()
                        },
                        onDrag = { change, amount ->
                            change.consume()
                            offset += amount.y
                        },
                        onDragEnd = {
                            val from = grabbed
                            val to = MeeshyReorderListRecipe.targetIndex(from, offset, heights.take(latestItems.size), spacingPx)
                            grabbed = NO_INDEX
                            offset = 0f
                            haptics.light()
                            if (from != NO_INDEX) commit(from, to)
                        },
                        onDragCancel = {
                            grabbed = NO_INDEX
                            offset = 0f
                        },
                    )
                })
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .zIndex(if (isGrabbed) 1f else 0f)
                    .onSizeChanged { size ->
                        while (heights.size <= index) heights.add(0f)
                        if (heights[index] != size.height.toFloat()) heights[index] = size.height.toFloat()
                    }
                    .graphicsLayer {
                        translationY = if (isGrabbed) offset else shifted
                        scaleX = scale
                        scaleY = scale
                        rotationZ = values.tiltDegrees
                    }
                    .shadow(if (values.lifted) 8.dp else 0.dp, RoundedCornerShape(16.dp))
                    .background(tokens.surfaceFill, RoundedCornerShape(16.dp))
                    .let { if (values.emphasized) it.border(2.dp, tint, RoundedCornerShape(16.dp)) else it }
                    .semantics {
                        contentDescription = itemLabel(item)
                        customActions = moves.map { move ->
                            CustomAccessibilityAction(labels.of(move)) {
                                commit(index, MeeshyReorderListRecipe.destination(move, index, items.size))
                                true
                            }
                        }
                    }
                    .onPreviewKeyEvent { event ->
                        if (!enabled || event.type != KeyEventType.KeyDown || !event.isAltPressed) return@onPreviewKeyEvent false
                        when (event.key) {
                            Key.DirectionUp -> { commit(index, index - 1); true }
                            Key.DirectionDown -> { commit(index, index + 1); true }
                            else -> false
                        }
                    }
                    .focusable()
                    .alpha(if (values.isPending) 0.6f else 1f)
                    .padding(horizontal = ROW_PADDING_DP.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(ROW_PADDING_DP.dp),
            ) {
                if (handleEdge == MeeshyReorderHandleEdge.Leading) handle()
                if (values.showsRank) RankBadge(index, values.rankBadgeDp, tint)
                Box(Modifier.weight(1f)) { row(item, index) }
                if (handleEdge == MeeshyReorderHandleEdge.Trailing) handle()
            }
        }
    }
}

private fun siblingShift(index: Int, grabbed: Int, target: Int, step: Float): Float = when {
    grabbed == NO_INDEX || index == grabbed -> 0f
    target > grabbed && index in (grabbed + 1)..target -> -step
    target < grabbed && index in target until grabbed -> step
    else -> 0f
}

@Composable
private fun ReorderHandle(values: MeeshyReorderValues, enabled: Boolean, ink: Color, gesture: Modifier) {
    Box(
        Modifier
            .size(values.handleWidthDp.dp, values.handleHeightDp.dp)
            .alpha(values.handleOpacity)
            .then(gesture)
            .decorative(),
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.DragHandle, contentDescription = null, tint = ink, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun RankBadge(index: Int, sizeDp: Float, tint: Color) {
    val fill = tint.copy(alpha = MeeshyReorderListRecipe.rankOpacity(index))
    Box(Modifier.size(sizeDp.dp).background(fill, CircleShape).decorative(), contentAlignment = Alignment.Center) {
        Text((index + 1).toString(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
    }
}
