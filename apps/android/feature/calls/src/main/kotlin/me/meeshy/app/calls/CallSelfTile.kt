package me.meeshy.app.calls

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallSafeInsets
import me.meeshy.sdk.model.call.CallSelfTileCorner
import me.meeshy.sdk.model.call.CallSelfTileLaw
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.sdk.model.call.CallSelfTileScale
import me.meeshy.sdk.model.call.CallTilePoint
import me.meeshy.sdk.model.call.CallTileSize
import me.meeshy.sdk.model.call.GroupStageTapRule
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme
import kotlin.math.roundToInt

/** La mémoire des paliers de la vignette, tenue pour le processus : un appel y retrouve SON palier. */
internal object CallSelfTileMemories {
    val shared: CallSelfTileMemory = CallSelfTileMemory()
}

private val TileShadow = 8.dp

/**
 * La vignette locale (ratio 1,4) : on la glisse, elle s'accroche au coin le plus proche en
 * ressort avec une haptique ; on la pince sur trois paliers (72 / 100 / 150 dp), retenus par
 * appel ; un toucher permute les deux vidéos quand les contrôles sont montrés, et les rend d'abord quand ils sont
 * rangés ([GroupStageTapRule], loi 15, [onReveal]). Rangée, elle se range par une TRANSFORMATION (G1.11) : son cadre reste
 * celui du palier choisi, une échelle ancrée à son coin d'écran la ramène à sa petite taille (immédiate avec « Réduire
 * les animations »), et son liseré, ses coins et son badge gardent ceux d'une petite vignette. Pour TalkBack elle est ajustable (petite, moyenne,
 * grande) et dit son état de survie quand [paused].
 *
 * Elle ne porte AUCUNE commande autour d'elle (#17327) : Caméra, Retourner, Effets et Écran sont le rail « Mon image » du
 * (…) ([CallActionRails]), si bien qu'au repos elle ne réserve plus la place d'une rangée sous l'en-tête ni au-dessus de la
 * pilule.
 *
 * [content] est le flux qu'elle montre ; [overlay] se pose par-dessus, au coin (micro coupé du pair
 * après une permutation). [rimHex] est la couleur de qui elle montre (loi 4, [CallTileRim]) : son liseré la porte,
 * sauf en pause où l'ambre prime ; sans couleur connue, le liseré reste blanc et fin.
 */
@Composable
internal fun CallSelfTile(
    callKey: String,
    memory: CallSelfTileMemory,
    paused: Boolean,
    reduceMotion: Boolean,
    onSwap: () -> Unit,
    modifier: Modifier = Modifier,
    controlsVisible: Boolean = true,
    /** Le toucher d'une vignette dont les contrôles sont rangés : ils reviennent d'abord (G1.9). */
    onReveal: () -> Unit = {},
    rimHex: String? = null,
    /** Posé par-dessus, au coin ; reçoit le facteur de rangement pour garder sa taille de petite vignette. */
    overlay: @Composable BoxScope.(stowFactor: Float) -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    BoxWithConstraints(modifier) {
        val density = LocalDensity.current
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        val container = CallTileSize(maxWidth.value, maxHeight.value)
        val safe = rememberCallSafeInsets(rtl)
        val bannerClearance = LocalCallSelfTileBannerClearance.current.value
        val insets = remember(safe, bannerClearance) { safe.copy(bannerDp = bannerClearance) }
        var corner by remember { mutableStateOf(CallSelfTileLaw.InitialCorner) }
        var scale by remember(callKey) { mutableStateOf(memory.scale(callKey)) }
        var pinch by remember { mutableFloatStateOf(1f) }
        var drag by remember { mutableStateOf(Offset.Zero) }
        var snapJob by remember { mutableStateOf<Job?>(null) }
        val scope = rememberCoroutineScope()
        val haptics = LocalHapticFeedback.current

        val size = CallSelfTileLaw.tileSize(container, insets, scale, pinch)
        val stowTarget = CallSelfTileLaw.restingFactor(scale, controlsVisible)
        val stowFactor by animateFloatAsState(
            targetValue = stowTarget,
            animationSpec = if (reduceMotion) snap<Float>() else tween<Float>(CallChromeStow.fadeMillis(reduceMotion = false)),
            label = "callSelfTileStow",
        )
        val center = CallSelfTileLaw.center(corner, container, size, insets)

        fun settle(target: CallSelfTileScale) {
            val previous = scale
            val continuous = previous.widthDp * pinch / target.widthDp
            scale = target
            pinch = continuous
            if (reduceMotion) pinch = 1f else scope.launch {
                animate(continuous, 1f, animationSpec = spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium)) { v, _ ->
                    pinch = v
                }
            }
            if (target != previous) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                memory.remember(target, callKey)
            }
        }

        fun dropAt(point: CallTilePoint) {
            val next = CallSelfTileLaw.nearestCorner(point, container, size, insets)
            val from = absolutePx(center, container, rtl, density) + drag
            val to = absolutePx(CallSelfTileLaw.center(next, container, size, insets), container, rtl, density)
            corner = next
            val start = from - to
            if (reduceMotion) {
                drag = Offset.Zero
            } else {
                drag = start
                snapJob?.cancel()
                snapJob = scope.launch {
                    animate(Offset.VectorConverter, start, Offset.Zero, animationSpec = spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow)) { v, _ ->
                        drag = v
                    }
                }
            }
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }

        val handlers = CallSelfTileGestureHandlers(
            onDrag = { delta ->
                snapJob?.cancel()
                drag += delta
            },
            onPinch = { magnification -> pinch = magnification },
            onTap = { if (GroupStageTapRule.tapsTheSwap(controlsVisible)) onSwap() else onReveal() },
            onEnd = { dragged, pinched ->
                if (dragged) {
                    val shift = drag / density.density
                    val leadingDx = if (rtl) -shift.x else shift.x
                    dropAt(CallTilePoint(center.xDp + leadingDx, center.yDp + shift.y))
                }
                if (pinched) {
                    settle(CallSelfTileScale.fromPinch(pinch, scale))
                } else if (!dragged) {
                    pinch = 1f
                }
            },
        )

        val rim = CallTileRim.selfTileBorder(paused, rimHex, MeeshyTheme.tokens.warning)
        val pivot = CallSelfTileLaw.anchor(corner).transformOrigin(rtl)
        val abs = absolutePx(center, container, rtl, density)
        val widthPx = size.widthDp * density.density
        val heightPx = size.heightDp * density.density
        val swapLabel = stringResource(R.string.call_stage_tile_swap)
        val swapHint = stringResource(R.string.call_stage_tile_swap_hint)
        val sizeName = tileSizeName(scale)
        val pausedName = stringResource(R.string.call_stage_video_paused)
        val pausedHint = stringResource(R.string.call_stage_video_paused_hint)
        val largerLabel = stringResource(R.string.call_stage_tile_larger)
        val smallerLabel = stringResource(R.string.call_stage_tile_smaller)

        Box(
            modifier = Modifier
                .offset { IntOffset((abs.x - widthPx / 2 + drag.x).roundToInt(), (abs.y - heightPx / 2 + drag.y).roundToInt()) }
                .size(size.widthDp.dp, size.heightDp.dp)
                .callSelfTileStowed(stowFactor, pivot, rim)
                .callSelfTileGestures(handlers)
                .semantics(mergeDescendants = true) {
                    contentDescription = if (paused) "$swapLabel, $pausedName. $pausedHint" else swapLabel
                    stateDescription = if (paused) "$sizeName, $pausedName" else sizeName
                    onClick(label = swapHint) { onSwap(); true }
                    progressBarRangeInfo = ProgressBarRangeInfo(current = (scale.ordinal + 1).toFloat(), range = 1f..3f, steps = 1)
                    setProgress { value ->
                        settle(CallSelfTileScale.entries[(value.roundToInt() - 1).coerceIn(0, 2)])
                        true
                    }
                    customActions = listOf(
                        CustomAccessibilityAction(largerLabel) { settle(scale.larger); true },
                        CustomAccessibilityAction(smallerLabel) { settle(scale.smaller); true },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            content()
            overlay(stowFactor)
        }
    }
}

/**
 * G1.11 — ma vignette rangée par une échelle ancrée à [pivot], jamais relayoutée ; ses coins, son ombre et son liseré
 * (loi 4) gardent ceux d'une petite vignette.
 */
private fun Modifier.callSelfTileStowed(stowFactor: Float, pivot: TransformOrigin, rim: BorderStroke): Modifier {
    val shape = RoundedCornerShape(CallSelfTileLaw.counterScaled(MeeshyRadius.smPlus.value, stowFactor).dp)
    return graphicsLayer {
        scaleX = stowFactor
        scaleY = stowFactor
        transformOrigin = pivot
    }
        .shadow(CallSelfTileLaw.counterScaled(TileShadow.value, stowFactor).dp, shape)
        .clip(shape)
        .border(BorderStroke(CallSelfTileLaw.counterScaled(rim.width.value, stowFactor).dp, rim.brush), shape)
}

/** Le pivot d'une ancre de la vignette : ses fractions vont du début de lecture vers la fin, miroitées en RTL. */
internal fun CallTilePoint.transformOrigin(rtl: Boolean): TransformOrigin = TransformOrigin(if (rtl) 1f - xDp else xDp, yDp)

/**
 * Ce qui garde, sur ma vignette rangée, sa taille de petite vignette (le badge du micro coupé, loi 11) : contre-mis à
 * l'échelle depuis son [corner] de vignette, miroité en RTL (iOS `scaleEffect(anchor: .bottomLeading)`).
 */
internal fun Modifier.callKeepsSmallTileSize(stowFactor: Float, corner: CallSelfTileCorner, rtl: Boolean): Modifier {
    val pivot = CallSelfTileLaw.anchor(corner).transformOrigin(rtl)
    val keep = CallSelfTileLaw.counterScaled(1f, stowFactor)
    return graphicsLayer {
        scaleX = keep
        scaleY = keep
        transformOrigin = pivot
    }
}

@Composable
private fun tileSizeName(scale: CallSelfTileScale): String = stringResource(
    when (scale) {
        CallSelfTileScale.X1 -> R.string.call_stage_tile_small
        CallSelfTileScale.X2 -> R.string.call_stage_tile_medium
        CallSelfTileScale.X3 -> R.string.call_stage_tile_large
    },
)

/** Les marges de zone sûre (barres système et découpe), du côté de lecture. */
@Composable
private fun rememberCallSafeInsets(rtl: Boolean): CallSafeInsets {
    val density = LocalDensity.current
    val direction = LocalLayoutDirection.current
    val insets = WindowInsets.systemBars.union(WindowInsets.displayCutout)
    val left = with(density) { insets.getLeft(density, direction).toDp().value }
    val right = with(density) { insets.getRight(density, direction).toDp().value }
    return CallSafeInsets(
        topDp = with(density) { insets.getTop(density).toDp().value },
        bottomDp = with(density) { insets.getBottom(density).toDp().value },
        startDp = if (rtl) right else left,
        endDp = if (rtl) left else right,
    )
}

/** Le centre [point] (coordonnées « début → fin ») en pixels écran, miroité en lecture droite-à-gauche. */
private fun absolutePx(point: CallTilePoint, container: CallTileSize, rtl: Boolean, density: Density): Offset {
    val x = if (rtl) container.widthDp - point.xDp else point.xDp
    return Offset(x * density.density, point.yDp * density.density)
}
