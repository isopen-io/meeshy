package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEffectsCompanionCorner
import me.meeshy.sdk.model.call.CallEffectsCompanionLayout
import me.meeshy.sdk.model.call.CallEffectsCompanionRule
import me.meeshy.sdk.model.call.CallTileSize
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import org.webrtc.EglBase
import org.webrtc.VideoTrack
import kotlin.math.roundToInt

private val MARGIN = 16.dp
private val INSET = 6.dp
private val SPACING = 8.dp
private val CHIP = 44.dp
private val BLOCK_RADIUS = 22.dp

private data class StripArrangement(val layout: CallEffectsCompanionLayout, val tileSize: CallTileSize) {
    val isEmpty: Boolean get() = layout.companions.isEmpty() && layout.overflow == 0
    val isSingleTile: Boolean get() = layout.companions.size == 1 && layout.overflow == 0
}

/**
 * Les autres participants du mode Effets (iOS `CallEffectsCompanionStrip`, #8737) : un bloc posé en haut que le doigt
 * emmène d'un coin du haut à l'autre, dans la bande LIBRE au-dessus des commandes du mode — jamais il ne les couvre.
 * Mes photos et mes films restent « mon image » : ils sont pris sur les pistes, jamais sur l'écran. TalkBack change
 * le bloc de côté par une action.
 */
@Composable
internal fun CallEffectsCompanionStrip(
    tiles: List<GroupCallStageTile>,
    trackFor: (GroupCallStageTile) -> VideoTrack?,
    eglContext: EglBase.Context,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var corner by remember { mutableStateOf(CallEffectsCompanionCorner.TopEnd) }
    var blockWidth by remember { mutableFloatStateOf(0f) }
    val dragX = remember { Animatable(0f) }
    val dragY = remember { Animatable(0f) }
    val moveLabel = stringResource(R.string.call_effects_companions_move)
    val groupLabel = stringResource(R.string.call_group_stage)

    BoxWithConstraints(modifier.fillMaxSize().semantics { contentDescription = groupLabel }) {
        val plan = arrangement(tiles, maxWidth.value, maxHeight.value)
        if (plan.isEmpty) return@BoxWithConstraints
        val containerPx = with(density) { maxWidth.toPx() }
        val marginPx = with(density) { MARGIN.toPx() }

        fun settle(target: CallEffectsCompanionCorner) {
            val changed = target != corner
            corner = target
            scope.launch {
                if (reduceMotion) {
                    dragX.snapTo(0f)
                    dragY.snapTo(0f)
                } else {
                    launch { dragX.animateTo(0f, spring(dampingRatio = 0.75f)) }
                    dragY.animateTo(0f, spring(dampingRatio = 0.75f))
                }
            }
            if (changed) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }

        Box(
            Modifier
                .align(if (corner == CallEffectsCompanionCorner.TopStart) Alignment.TopStart else Alignment.TopEnd)
                .padding(horizontal = MARGIN)
                .offset { IntOffset(dragX.value.roundToInt(), dragY.value.roundToInt()) }
                .onSizeChanged { blockWidth = it.width.toFloat() }
                .pointerInput(corner, isRtl, containerPx, blockWidth) {
                    detectDragGestures(
                        onDrag = { change, amount ->
                            change.consume()
                            scope.launch {
                                dragX.snapTo(dragX.value + amount.x)
                                dragY.snapTo(0f)
                            }
                        },
                        onDragEnd = {
                            val restingX = CallEffectsCompanionRule.restingCenterX(corner, blockWidth, containerPx, marginPx, isRtl)
                            settle(CallEffectsCompanionRule.corner(restingX + dragX.value, containerPx, isRtl))
                        },
                        onDragCancel = { settle(corner) },
                    )
                }
                .semantics { customActions = listOf(CustomAccessibilityAction(moveLabel) { settle(corner.other); true }) },
        ) {
            StripBlock(plan, trackFor, eglContext)
        }
    }
}

private fun arrangement(tiles: List<GroupCallStageTile>, widthDp: Float, heightDp: Float): StripArrangement {
    val everyone = CallEffectsCompanionRule.layout(tiles, featuredId = null, capacity = 0)
    val tileSize = CallEffectsCompanionRule.tileSize(everyone.overflow, heightDp - 2 * INSET.value)
        ?: return StripArrangement(everyone.copy(companions = emptyList(), overflow = 0), CallTileSize(0f, 0f))
    val capacity = CallEffectsCompanionRule.capacity(
        availableWidth = widthDp - 2 * (MARGIN.value + INSET.value),
        tileWidth = tileSize.widthDp,
        spacing = SPACING.value,
        chipWidth = CHIP.value,
        count = everyone.overflow,
    )
    return StripArrangement(CallEffectsCompanionRule.layout(tiles, featuredId = null, capacity = capacity), tileSize)
}

@Composable
private fun StripBlock(plan: StripArrangement, trackFor: (GroupCallStageTile) -> VideoTrack?, eglContext: EglBase.Context) {
    val tileModifier = Modifier.size(plan.tileSize.widthDp.dp, plan.tileSize.heightDp.dp)
    if (plan.isSingleTile) {
        val only = plan.layout.companions.first()
        CallGroupTile(only, trackFor(only), eglContext, mirror = false, modifier = tileModifier.shadow(8.dp, RoundedCornerShape(BLOCK_RADIUS)))
        return
    }
    Row(
        Modifier
            .clip(RoundedCornerShape(BLOCK_RADIUS))
            .background(Color.Black.copy(alpha = 0.35f))
            .padding(INSET),
        horizontalArrangement = Arrangement.spacedBy(SPACING),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        plan.layout.companions.forEach { tile ->
            CallGroupTile(tile, trackFor(tile), eglContext, mirror = false, modifier = tileModifier)
        }
        if (plan.layout.overflow > 0) OverflowChip(plan.layout.overflow)
    }
}

@Composable
private fun OverflowChip(count: Int) {
    val label = stringResource(R.string.call_effects_companions_more, count)
    Box(
        Modifier
            .size(CHIP)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f))
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Text("+$count", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
