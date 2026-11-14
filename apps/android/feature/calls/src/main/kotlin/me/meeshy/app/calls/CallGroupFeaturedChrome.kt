package me.meeshy.app.calls

import androidx.annotation.StringRes
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallVerticalEdge
import me.meeshy.sdk.model.call.group.CallStageRect
import me.meeshy.sdk.model.call.group.GroupCallStageFocus
import me.meeshy.sdk.model.call.group.GroupCallSpotlightButton
import me.meeshy.sdk.model.call.group.GroupCallStageGeometry
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * U2.5 — la puce de verre de l'écran partagé mis à la une, en haut à gauche de la scène : « Écran de X », puis le facteur
 * de zoom (« · 2× »). Décorative (la vignette porte déjà « Écran de X » à TalkBack) : elle ne prend aucun toucher, le
 * pincement la traverse. Iso iOS `CallScreenShareChip`.
 */
@Composable
internal fun CallScreenShareChip(text: String, modifier: Modifier = Modifier) {
    CallGlassPlate(modifier = modifier.clearAndSetSemantics { }, shape = CircleShape) {
        CallToneScrim()
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(MeeshyIcons.FlipToFront, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(CHIP_ICON))
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                color = CallPalette.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * La puce arrive en fondu UNE fois, avec la une — pas à chaque bascule du plein écran. L'état vit donc au niveau de la
 * scène, qui survit à la bascule ; « Réduire les animations » raccourcit le fondu.
 */
@Composable
internal fun rememberCallArrivalFade(): State<Float> {
    val reduceMotion = rememberCallReduceMotion()
    val arrival = remember { Animatable(0f) }
    LaunchedEffect(Unit) { arrival.animateTo(1f, tween(CallChromeStow.fadeMillis(reduceMotion))) }
    return arrival.asState()
}

/** Le dernier endroit où la une s'est posée : la capsule qui repart en fondu au retour à la grille y reste. */
private class CallCapsuleSpot {
    var rect: CallStageRect? = null
}

/**
 * U1.10 · U1.12 · #8550 — la capsule « Revenir à la grille · Plein écran » de la personne à la une ; en plein écran, elle
 * porte aussi la montée au plein écran total et la descente d'un niveau ([buttons], loi 15, #17961). Elle vit au niveau de
 * la SCÈNE, pas dans la vignette : elle survit donc au plein écran (aucun fondu rejoué à la bascule) et repart en fondu
 * quand la scène revient à la grille, au lieu de disparaître sur la même image. Elle se range AVEC les contrôles
 * ([isChromeVisible], `CallChromeElement.FeaturedCapsule`) : elle sort par le haut de l'écran, et revient au second
 * toucher. Posée sur le coin haut-fin de la case de la une ([GroupCallStageGeometry.rects]), qu'elle suit au rythme du
 * mouvement de la scène. [width] et [height] sont la taille de la scène ; [isStripHidden], le plein écran total.
 */
@Composable
internal fun CallGroupFeaturedCapsule(
    tileIds: List<String>,
    featuredId: String?,
    focus: GroupCallStageFocus,
    isStripHidden: Boolean,
    width: Dp,
    height: Dp,
    isCompactHeight: Boolean,
    isChromeVisible: Boolean,
    buttons: List<GroupCallSpotlightButton>,
    onRevive: () -> Unit,
    onButton: (GroupCallSpotlightButton) -> Unit,
) {
    val reduceMotion = rememberCallReduceMotion()
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val target = featuredId?.let { GroupCallStageGeometry.rects(tileIds, focus, width.value, height.value, isStripHidden, isRtl, isCompactHeight)[it] }
    val spot = remember { CallCapsuleSpot() }
    if (target != null) spot.rect = target
    val isPresent = target != null
    val presence = animateFloatAsState(if (isPresent) 1f else 0f, tween(CallChromeStow.fadeMillis(reduceMotion)), label = "callCapsulePresence")
    val held = spot.rect
    if (held != null && (isPresent || presence.value > 0f)) {
        CallGroupCapsuleBox(
            held = held,
            presence = presence,
            isChromeVisible = isChromeVisible,
            isInteractive = isPresent && isChromeVisible,
            buttons = buttons,
            reduceMotion = reduceMotion,
            onRevive = onRevive,
            onButton = onButton,
        )
    }
}

/** La case de la une, suivie au rythme du mouvement de la scène, et la capsule rangée à son coin haut-fin. */
@Composable
private fun CallGroupCapsuleBox(
    held: CallStageRect,
    presence: State<Float>,
    isChromeVisible: Boolean,
    isInteractive: Boolean,
    buttons: List<GroupCallSpotlightButton>,
    reduceMotion: Boolean,
    onRevive: () -> Unit,
    onButton: (GroupCallSpotlightButton) -> Unit,
) {
    val move: AnimationSpec<Float> = if (reduceMotion) snap() else tween(STAGE_MOTION_MILLIS, easing = FastOutSlowInEasing)
    val left = animateFloatAsState(held.left, move, label = "callCapsuleLeft")
    val top = animateFloatAsState(held.top, move, label = "callCapsuleTop")
    val boxWidth = animateFloatAsState(held.width, move, label = "callCapsuleWidth")
    val boxHeight = animateFloatAsState(held.height, move, label = "callCapsuleHeight")
    var stageTopPx by remember { mutableFloatStateOf(0f) }
    val stageTop = with(LocalDensity.current) { stageTopPx.toDp() }
    // P11.1 · P14 · U1 : l'en-tête flotte sur le haut de la scène ; la capsule se tient sous lui, et sa course de rangement
    // part de là (la position mesurée suit le décalage).
    val belowHeader = LocalCallGroupGridClearance.current
    Box(
        Modifier
            .callBelowTheFloatingHeader(belowHeader)
            .onGloballyPositioned { stageTopPx = it.positionInWindow().y }
            .layout { measurable, constraints ->
                val fixed = Constraints.fixed(boxWidth.value.dp.roundToPx().coerceAtLeast(0), boxHeight.value.dp.roundToPx().coerceAtLeast(0))
                val placeable = measurable.measure(fixed)
                layout(constraints.maxWidth, constraints.maxHeight) {
                    placeable.place(left.value.dp.roundToPx(), top.value.dp.roundToPx())
                }
            },
    ) {
        CallChromeFade(
            isVisible = isChromeVisible,
            onRevive = onRevive,
            modifier = Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm),
            stowsToward = CallVerticalEdge.Top,
            edgeMargin = stageTop + MeeshySpacing.sm,
        ) {
            CallGroupSpotlightControls(
                buttons = buttons,
                isInteractive = isInteractive,
                reduceMotion = reduceMotion,
                onButton = onButton,
                modifier = Modifier.graphicsLayer { alpha = presence.value },
            )
        }
    }
}

/**
 * « Revenir à la grille », puis « Plein écran » (qui garde sa place et monte d'un niveau à chaque appui), puis
 * « Quitter » au glyphe rentrer, dans UN verre au ton de l'écran — iOS `spotlightControls`. La capsule s'allonge ou se
 * resserre par sa taille quand un bouton paraît ou part (loi 17) ; « Réduire les animations » la pose d'un coup.
 */
@Composable
private fun CallGroupSpotlightControls(
    buttons: List<GroupCallSpotlightButton>,
    isInteractive: Boolean,
    reduceMotion: Boolean,
    onButton: (GroupCallSpotlightButton) -> Unit,
    modifier: Modifier = Modifier,
) {
    val inert = if (isInteractive) Modifier else Modifier.clearAndSetSemantics { }
    val resize: FiniteAnimationSpec<IntSize> = if (reduceMotion) snap() else tween(STAGE_MOTION_MILLIS, easing = FastOutSlowInEasing)
    CallGlassPlate(modifier = modifier.then(inert), shape = CircleShape) {
        CallToneScrim()
        Row(modifier = Modifier.animateContentSize(resize), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            buttons.forEach { button ->
                key(button) {
                    CallGroupSpotlightButton(button.icon(), stringResource(button.label()), isInteractive) { onButton(button) }
                }
            }
        }
    }
}

private fun GroupCallSpotlightButton.icon(): ImageVector = when (this) {
    GroupCallSpotlightButton.Grid -> MeeshyIcons.GridView
    GroupCallSpotlightButton.FullScreen, GroupCallSpotlightButton.TotalFullScreen -> MeeshyIcons.OpenInFull
    GroupCallSpotlightButton.ExitFullScreen, GroupCallSpotlightButton.ExitTotalFullScreen -> MeeshyIcons.CloseFullscreen
}

@StringRes
private fun GroupCallSpotlightButton.label(): Int = when (this) {
    GroupCallSpotlightButton.Grid -> R.string.call_group_grid
    GroupCallSpotlightButton.FullScreen -> R.string.call_group_fullscreen_enter
    GroupCallSpotlightButton.TotalFullScreen -> R.string.call_spotlight_total_enter
    GroupCallSpotlightButton.ExitFullScreen -> R.string.call_group_fullscreen_exit
    GroupCallSpotlightButton.ExitTotalFullScreen -> R.string.call_spotlight_total_exit
}

@Composable
private fun CallGroupSpotlightButton(icon: ImageVector, label: String, isEnabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(SPOTLIGHT_BUTTON)
            .clickable(enabled = isEnabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White)
    }
}

private val SPOTLIGHT_BUTTON = 48.dp
private val CHIP_ICON = 14.dp
