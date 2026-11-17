package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
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
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.runtime.staticCompositionLocalOf
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
import androidx.compose.ui.semantics.clearAndSetSemantics
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
import me.meeshy.sdk.model.call.CallSelfTilePlate
import me.meeshy.sdk.model.call.CallSelfTileScale
import me.meeshy.sdk.model.call.CallTilePoint
import me.meeshy.sdk.model.call.CallTileSize
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.GroupStageTapRule
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import kotlin.math.roundToInt

/** La mémoire des paliers de la vignette, tenue pour le processus : un appel y retrouve SON palier. */
internal object CallSelfTileMemories {
    val shared: CallSelfTileMemory = CallSelfTileMemory()
}

/**
 * L1.8 · L2.8 (#17965) — ce que ma vignette et ses voisins du haut de l'écran se disent, tenu par l'écran d'appel : les rails
 * du (…) disent qu'ils sont dehors ([railsShown], écrit par [CallActionRails]) et ma vignette leur cède son coin en paysage ;
 * ma vignette dit la place qu'elle tient depuis le bord quand elle est en haut ([bannerReserveDp]) et la pile des bannières,
 * bornée et centrée, la longe ([CallTopBannerStackHost]). Chacun ne change qu'une fois par mouvement.
 */
@Stable
internal class CallSelfTileNeighbours {
    var railsShown: Boolean by mutableStateOf(false)
    var bannerReserveDp: Float by mutableFloatStateOf(0f)
}

internal val LocalCallSelfTileNeighbours = staticCompositionLocalOf<CallSelfTileNeighbours?> { null }

private val TileShadow = 8.dp

/**
 * La vignette locale (portrait 1,4 ; couchée en 130 × 96 dans une fenêtre plus large que haute, L1.5) : on la glisse, elle s'accroche au coin le plus proche en
 * ressort avec une haptique ; on la pince sur trois paliers (72 / 100 / 150 dp), retenus par
 * appel ; un toucher permute les deux vidéos quand les contrôles sont montrés, et les rend d'abord quand ils sont
 * rangés ([GroupStageTapRule], loi 15, [onReveal]). Rangée, elle se range par une TRANSFORMATION (G1.11) : son cadre reste
 * celui du palier choisi, une échelle ancrée à son coin d'écran la ramène à sa petite taille (immédiate avec « Réduire
 * les animations »), et son liseré, ses coins et sa plaque gardent ceux d'une petite vignette. Pour TalkBack elle est ajustable (petite, moyenne,
 * grande) et dit son état de survie quand [paused].
 *
 * Elle ne porte AUCUNE commande autour d'elle (#17327) : Caméra, Retourner, Effets et Écran sont le rail « Mon image » du
 * (…) ([CallActionRails]), si bien qu'au repos elle ne réserve plus la place d'une rangée sous l'en-tête ni au-dessus de la
 * pilule.
 *
 * [content] est le flux qu'elle montre ; [overlay] se pose par-dessus, au coin (le zoom de ma caméra). [rimHex] est la
 * couleur de qui elle montre (loi 4, [CallTileRim]) : son liseré la porte, sauf en pause où l'ambre prime ; sans couleur
 * connue, le liseré reste blanc et fin. [plate] est sa plaque (#17982) : « Vous », ou qui elle montre une fois permutée,
 * [plateLeading] ce que la plaque porte avant le nom (le micro coupé de l'autre), comme une tuile de groupe.
 *
 * En paysage, elle garde son coin à côté de la pile des bannières bornée à 560 (L1.8) et le cède aux rails du (…), vers
 * l'intérieur, en glissant au pas des rails (L2.8) ; elle y revient quand ils se rangent ([CallSelfTileNeighbours]).
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
    plate: CallSelfTilePlate? = null,
    plateLeading: @Composable RowScope.() -> Unit = {},
    /** Posé par-dessus, au coin ; reçoit le facteur de rangement pour garder sa taille de petite vignette. */
    overlay: @Composable BoxScope.(stowFactor: Float) -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    BoxWithConstraints(modifier) {
        val density = LocalDensity.current
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        val container = CallTileSize(maxWidth.value, maxHeight.value)
        var corner by remember { mutableStateOf(CallSelfTileLaw.InitialCorner) }
        var scale by remember(callKey) { mutableStateOf(memory.scale(callKey)) }
        val insets = rememberCallSelfTileInsets(container, corner, scale, rtl)
        val railGlide = rememberCallSelfTileRailGlide(insets.railDp, reduceMotion)
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
        val rotation = rememberCallSelfTileRotation(CallSelfTileLaw.isLandscape(container), size, reduceMotion)

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
            val glidePx = railGlidePx(corner, railGlide.value, insets.railDp, rtl, density)
            val from = absolutePx(center, container, rtl, density) + drag + Offset(glidePx, 0f)
            val to = absolutePx(CallSelfTileLaw.center(next, container, size, insets), container, rtl, density)
            corner = next
            scope.launch { railGlide.snapTo(insets.railDp) }
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
        val speech = rememberCallSelfTileSpeech(scale, paused)

        Box(
            modifier = Modifier
                .callSelfTileOffset(CallSelfTilePlacement(center, size, container, corner, rtl), { drag }, railGlide, insets.railDp)
                .size(size.widthDp.dp, size.heightDp.dp)
                .callSelfTileRotating(rotation, pivot)
                .callSelfTileStowed(stowFactor, pivot, rim)
                .callSelfTileGestures(handlers)
                .callSelfTileSemantics(speech, scale, onSwap, ::settle),
            contentAlignment = Alignment.Center,
        ) {
            content()
            overlay(stowFactor)
            plate?.let { CallSelfTileNameplate(it, stowFactor, CallSelfTilePlateFit(size.widthDp, stowTarget), plateLeading) }
        }
    }
}

/** Où ma vignette est mise en page : son centre de repos, sa taille, le conteneur, son coin et le sens de lecture. */
private class CallSelfTilePlacement(
    val center: CallTilePoint,
    val size: CallTileSize,
    val container: CallTileSize,
    val corner: CallSelfTileCorner,
    val rtl: Boolean,
)

/**
 * La place de ma vignette, lue à la mise en page et jamais à la composition : son centre de repos, le glissé du doigt
 * ([drag]) et le glissement vers la place cédée aux rails (L2.8, [CallSelfTileLaw.railGlideDp]) — aucune recomposition par
 * image pendant qu'elle glisse.
 */
private fun Modifier.callSelfTileOffset(
    placement: CallSelfTilePlacement,
    drag: () -> Offset,
    railGlide: Animatable<Float, AnimationVector1D>,
    railTargetDp: Float,
): Modifier = offset {
    val abs = absolutePx(placement.center, placement.container, placement.rtl, this)
    val glidePx = railGlidePx(placement.corner, railGlide.value, railTargetDp, placement.rtl, this)
    val now = drag()
    val halfW = placement.size.widthDp * density / 2
    val halfH = placement.size.heightDp * density / 2
    IntOffset((abs.x - halfW + now.x + glidePx).roundToInt(), (abs.y - halfH + now.y).roundToInt())
}

/** L2.8 — le glissement vers la place cédée, en pixels écran : un pas « vers la fin » va à gauche en lecture droite-à-gauche. */
private fun railGlidePx(corner: CallSelfTileCorner, shownDp: Float, targetDp: Float, rtl: Boolean, density: Density): Float {
    val glideDp = CallSelfTileLaw.railGlideDp(corner, shownDp, targetDp)
    return (if (rtl) -glideDp else glideDp) * density.density
}

/**
 * L2.8 — la place cédée aux rails telle que l'œil la voit : elle rejoint la place mise en page au pas des rails
 * ([CALL_RAIL_SLIDE_MILLIS]), et d'un coup sous « Réduire les animations », comme ma vignette qui s'accroche à un coin.
 */
@Composable
private fun rememberCallSelfTileRailGlide(targetDp: Float, reduceMotion: Boolean): Animatable<Float, AnimationVector1D> {
    val glide = remember { Animatable(targetDp) }
    LaunchedEffect(targetDp, reduceMotion) {
        if (reduceMotion) glide.snapTo(targetDp) else glide.animateTo(targetDp, tween(CALL_RAIL_SLIDE_MILLIS))
    }
    return glide
}

/**
 * Les marges de ma vignette : la zone sûre, la place cédée aux rails en paysage (L2.8), et la pile des bannières qu'elle
 * descend seulement quand elle ne peut pas la longer (L1.8, [CallTopBannerStack.span]). La place qu'elle tient depuis le
 * bord se mesure à son palier choisi, sans la pile : la pile la longe sans que l'une attende l'autre.
 */
@Composable
private fun rememberCallSelfTileInsets(
    container: CallTileSize,
    corner: CallSelfTileCorner,
    scale: CallSelfTileScale,
    rtl: Boolean,
): CallSafeInsets {
    val neighbours = LocalCallSelfTileNeighbours.current
    val railsShown = neighbours?.railsShown == true
    val safe = rememberCallSafeInsets(rtl).copy(railDp = CallSelfTileLaw.railYieldDp(CallSelfTileLaw.isLandscape(container), railsShown))
    val settled = CallSelfTileLaw.tileSize(container, safe, scale, pinch = 1f)
    val reserve = CallSelfTileLaw.bannerReserveDp(corner, safe, settled.widthDp)
    PublishesBannerReserve(neighbours, reserve)
    val stack = LocalCallSelfTileBannerClearance.current.value.value
    return safe.copy(bannerDp = CallTopBannerStack.span(container, reserve).selfTileClearanceDp(stack))
}

/** Ma vignette dit à la pile la place qu'elle tient ; partie, elle ne la tient plus. */
@Composable
private fun PublishesBannerReserve(neighbours: CallSelfTileNeighbours?, reserveDp: Float) {
    if (neighbours == null) return
    SideEffect { neighbours.bannerReserveDp = reserveDp }
    DisposableEffect(neighbours) { onDispose { neighbours.bannerReserveDp = 0f } }
}

/** Ce que TalkBack dit de ma vignette : permuter, sa taille, son état de survie, et les deux réglages de taille. */
private class CallSelfTileSpeech(
    val description: String,
    val state: String,
    val swapHint: String,
    val larger: String,
    val smaller: String,
)

@Composable
private fun rememberCallSelfTileSpeech(scale: CallSelfTileScale, paused: Boolean): CallSelfTileSpeech {
    val swapLabel = stringResource(R.string.call_stage_tile_swap)
    val sizeName = tileSizeName(scale)
    val pausedName = stringResource(R.string.call_stage_video_paused)
    val pausedHint = stringResource(R.string.call_stage_video_paused_hint)
    return CallSelfTileSpeech(
        description = if (paused) "$swapLabel, $pausedName. $pausedHint" else swapLabel,
        state = if (paused) "$sizeName, $pausedName" else sizeName,
        swapHint = stringResource(R.string.call_stage_tile_swap_hint),
        larger = stringResource(R.string.call_stage_tile_larger),
        smaller = stringResource(R.string.call_stage_tile_smaller),
    )
}

/** Pour TalkBack, ma vignette est UN nœud ajustable (petite, moyenne, grande) ; sa plaque s'y lit avec elle. */
private fun Modifier.callSelfTileSemantics(
    speech: CallSelfTileSpeech,
    scale: CallSelfTileScale,
    onSwap: () -> Unit,
    settle: (CallSelfTileScale) -> Unit,
): Modifier = semantics(mergeDescendants = true) {
    contentDescription = speech.description
    stateDescription = speech.state
    onClick(label = speech.swapHint) { onSwap(); true }
    progressBarRangeInfo = ProgressBarRangeInfo(current = (scale.ordinal + 1).toFloat(), range = 1f..3f, steps = 1)
    setProgress { value ->
        settle(CallSelfTileScale.entries[(value.roundToInt() - 1).coerceIn(0, 2)])
        true
    }
    customActions = listOf(
        CustomAccessibilityAction(speech.larger) { settle(scale.larger); true },
        CustomAccessibilityAction(speech.smaller) { settle(scale.smaller); true },
    )
}

/** La largeur de la vignette posée et la cible de son rangement : ce que la plaque ne dépasse pas. */
private class CallSelfTilePlateFit(val tileWidthDp: Float, val stowTarget: Float)

/**
 * #17982 (P1.4, G1.2, W1.18, S2.5, P16.8, L1.5) — la plaque de ma vignette de duo : LA plaque de la grille de groupe
 * ([CallTileNameplate], clé partagée dans les sept langues), en bas au centre, lue avec la vignette. Rangée au toucher, elle
 * suit ma vignette à sa taille de petite vignette (loi 11), son écart au bord compris ; elle ne dépasse jamais la vignette
 * montrée, si bien que le liseré reste libre.
 */
@Composable
private fun BoxScope.CallSelfTileNameplate(
    plate: CallSelfTilePlate,
    stowFactor: Float,
    fit: CallSelfTilePlateFit,
    leading: @Composable RowScope.() -> Unit,
) {
    val text = callSelfTilePlateText(plate)
    val maxWidth = CallSelfTileLaw.plateMaxWidthDp(fit.tileWidthDp, fit.stowTarget, MeeshySpacing.xs.value)
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .callKeepsSmallTileSize(stowFactor, TransformOrigin(0.5f, 1f))
            .padding(bottom = MeeshySpacing.xs),
    ) {
        CallTileNameplate(
            text = text,
            modifier = Modifier.widthIn(max = maxWidth.dp).clearAndSetSemantics { contentDescription = text },
            leading = leading,
        )
    }
}

@Composable
private fun callSelfTilePlateText(plate: CallSelfTilePlate): String = when (plate) {
    CallSelfTilePlate.You -> stringResource(R.string.call_group_tile_you)
    CallSelfTilePlate.Unknown -> stringResource(R.string.call_group_tile_unknown)
    is CallSelfTilePlate.Named -> plate.name
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

/** L1.5 — la transition d'une rotation : d'où part la taille ([start], rapport de l'ancienne) et où elle en est ([progress], 0 → 1). */
internal class CallSelfTileRotation(val start: CallTilePoint, val progress: Animatable<Float, AnimationVector1D>)

/** Ce que la vignette montrait à la composition d'avant : sa taille posée, et la rotation qui la mettait à l'échelle. */
private class CallSelfTileShown(var layout: CallTileSize, var rotation: CallSelfTileRotation?) {
    fun size(): CallTileSize {
        val running = rotation ?: return layout
        val fraction = Snapshot.withoutReadObservation { running.progress.value }
        return CallSelfTileLaw.shownDuringRotation(layout, running.start, fraction)
    }
}

/**
 * L1.5 — quand la fenêtre change de forme, la vignette se couche ou se relève : la taille qu'elle MONTRAIT, en rapport
 * de la nouvelle ([CallSelfTileLaw.rotationStart]), revient à 1, ancrée à son coin d'écran qui garde sa marge.
 * Interruptible : une rotation reprise à mi-course repart de la taille montrée ([CallSelfTileLaw.shownDuringRotation]).
 * « Réduire les animations » : elle se pose sans mouvement, comme le rangement.
 */
@Composable
private fun rememberCallSelfTileRotation(isLandscape: Boolean, size: CallTileSize, reduceMotion: Boolean): CallSelfTileRotation {
    val shown = remember { CallSelfTileShown(size, rotation = null) }
    val rotation = remember(isLandscape) {
        val settled = shown.rotation == null
        CallSelfTileRotation(CallSelfTileLaw.rotationStart(shown.size(), size), Animatable(if (settled) 1f else 0f))
    }
    SideEffect {
        shown.layout = size
        shown.rotation = rotation
    }
    LaunchedEffect(rotation) {
        if (reduceMotion) {
            rotation.progress.snapTo(1f)
        } else {
            rotation.progress.animateTo(1f, tween(CallChromeStow.fadeMillis(reduceMotion = false)))
        }
    }
    return rotation
}

/** La rotation est une TRANSFORMATION lue à la phase de dessin : aucune recomposition par image. */
private fun Modifier.callSelfTileRotating(rotation: CallSelfTileRotation, pivot: TransformOrigin): Modifier = graphicsLayer {
    val fraction = rotation.progress.value
    scaleX = CallSelfTileLaw.rotationScale(rotation.start.xDp, fraction)
    scaleY = CallSelfTileLaw.rotationScale(rotation.start.yDp, fraction)
    transformOrigin = pivot
}

/** Le pivot d'une ancre de la vignette : ses fractions vont du début de lecture vers la fin, miroitées en RTL. */
internal fun CallTilePoint.transformOrigin(rtl: Boolean): TransformOrigin = TransformOrigin(if (rtl) 1f - xDp else xDp, yDp)

/**
 * Ce qui garde, sur ma vignette rangée, sa taille de petite vignette (sa plaque, micro coupé de l'autre compris, loi 11) :
 * contre-mis à l'échelle depuis [pivot], le point de lui-même qui reste où la vignette rangée le pose (le bas au centre
 * pour la plaque, insensible au sens de lecture).
 */
internal fun Modifier.callKeepsSmallTileSize(stowFactor: Float, pivot: TransformOrigin): Modifier {
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
