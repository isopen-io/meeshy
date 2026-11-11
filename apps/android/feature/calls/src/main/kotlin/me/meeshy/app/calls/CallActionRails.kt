package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import me.meeshy.sdk.model.call.CallActionFamilyRow
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallRailSide
import me.meeshy.sdk.model.call.CallRailsLayout
import me.meeshy.sdk.model.call.railSide
import kotlin.math.max

private val RAIL_TOP = 56.dp
private val RAIL_SCROLL_FADE = 28.dp
private const val RAIL_SLIDE_MILLIS = 250

/**
 * #17327 — À DEUX, le (…) fait sortir deux rails verticaux sur les bords : « Mon image » au début, « L'appel » à la fin,
 * centrés sur la hauteur libre, la pilule ne grandit pas. Chaque rail est une capsule de verre ([CallControlsGlass]) dont
 * les boutons sont ceux des rangées de la pilule ([CallPillButton]) : même verre, même libellé TalkBack, même ordre
 * (miroir d'iOS `callActionRails`). Il entre par SON bord de l'écran et en sort par lui (translation et opacité, [CallRailsLayout.slideOffset],
 * retournée en lecture droite-à-gauche) ; « Réduire les animations » le remplace par un fondu. [rows] vient de
 * [me.meeshy.sdk.model.call.CallControlsDisposition.railRows] : vide, les rails repartent. [bottomClearance] garde la
 * pilule libre en portrait ([CallRailsLayout.bottomClearance]).
 */
@Composable
internal fun CallActionRails(
    rows: List<CallActionFamilyRow>,
    items: Map<CallAction, CallPillItem>,
    dimmed: Set<CallAction>,
    onAction: (CallAction) -> Unit,
    bottomClearance: Dp,
    modifier: Modifier = Modifier,
    /** A rail button touched while its rail is leaving relights the controls first (G2.7). */
    onRevive: () -> Unit = {},
) {
    val safeHorizontal = rememberCallSafeHorizontalDp()
    Box(
        modifier
            .fillMaxSize()
            .padding(top = RAIL_TOP, bottom = bottomClearance)
            .padding(horizontal = CallRailsLayout.EDGE_INSET_DP.dp),
    ) {
        listOf(CallActionFamily.MyImage, CallActionFamily.TheCall).forEach { family ->
            key(family) {
                CallActionRailSlot(
                    family = family,
                    row = rows.firstOrNull { it.family == family },
                    items = items,
                    dimmed = dimmed,
                    onAction = onAction,
                    safeHorizontalDp = safeHorizontal,
                    onRevive = onRevive,
                )
            }
        }
    }
}

/** Le retrait de zone sûre horizontal, identique des deux côtés : la fenêtre donne des bords physiques, pas de lecture. */
@Composable
private fun rememberCallSafeHorizontalDp(): Float {
    val density = LocalDensity.current
    val direction = LocalLayoutDirection.current
    val insets = WindowInsets.systemBars.union(WindowInsets.displayCutout)
    return with(density) { max(insets.getLeft(density, direction), insets.getRight(density, direction)).toDp().value }
}

/**
 * La place d'un rail : il garde sa dernière rangée le temps de sortir (quand [row] devient `null`, la sortie se joue sur
 * ce qu'il montrait), et ne touche que la translation et l'opacité.
 */
@Composable
private fun BoxScope.CallActionRailSlot(
    family: CallActionFamily,
    row: CallActionFamilyRow?,
    items: Map<CallAction, CallPillItem>,
    dimmed: Set<CallAction>,
    onAction: (CallAction) -> Unit,
    safeHorizontalDp: Float,
    onRevive: () -> Unit,
) {
    var lastRow by remember { mutableStateOf(row) }
    SideEffect { if (row != null) lastRow = row }
    val reduceMotion = rememberCallReduceMotion()
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val side = family.railSide
    val travelPx = with(LocalDensity.current) { CallRailsLayout.slideOffset(side, rtl, safeHorizontalDp).dp.roundToPx() }
    val fade = CallChromeStow.fadeMillis(reduceMotion)
    AnimatedVisibility(
        visible = row != null,
        modifier = Modifier.align(if (side == CallRailSide.Leading) Alignment.CenterStart else Alignment.CenterEnd),
        enter = if (reduceMotion) fadeIn(tween(fade)) else slideInHorizontally(tween(RAIL_SLIDE_MILLIS)) { travelPx } + fadeIn(tween(RAIL_SLIDE_MILLIS)),
        exit = if (reduceMotion) fadeOut(tween(fade)) else slideOutHorizontally(tween(RAIL_SLIDE_MILLIS)) { travelPx } + fadeOut(tween(RAIL_SLIDE_MILLIS)),
    ) {
        (row ?: lastRow)?.let { shown ->
            Box(Modifier.callReviveOnTouch(isHidden = row == null, onRevive = onRevive)) {
                CallActionRail(shown, items, dimmed, onAction)
            }
        }
    }
}

/** Une capsule de verre verticale : ses boutons de 48 dp se posent dans un même bloc ; trop haute (paysage, écran court), elle défile. */
@Composable
private fun CallActionRail(
    row: CallActionFamilyRow,
    items: Map<CallAction, CallPillItem>,
    dimmed: Set<CallAction>,
    onAction: (CallAction) -> Unit,
) {
    val title = callFamilyTitle(row.family)
    val scroll = rememberScrollState()
    CallControlsGlass(
        modifier = Modifier
            .width(CallRailsLayout.RAIL_WIDTH_DP.dp)
            .semantics(mergeDescendants = false) {
                title?.let { contentDescription = it }
                isTraversalGroup = true
            },
        shape = RoundedCornerShape(percent = 50),
    ) {
        Column(
            modifier = Modifier
                .callRailScrollFade(scroll)
                .verticalScroll(scroll)
                .padding(CallRailsLayout.PADDING_DP.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(CallRailsLayout.BUTTON_SPACING_DP.dp),
        ) {
            row.actions.mapNotNull { items[it] }.forEach { item ->
                key(item.action) {
                    CallPillButton(
                        icon = item.icon,
                        kind = item.kind,
                        label = stringResource(item.labelRes),
                        hint = item.hintRes?.let { stringResource(it) },
                        toggleState = if (item.isToggle) item.kind != CallPillKind.Normal else null,
                        diameter = CallRailsLayout.BUTTON_SIDE_DP.dp,
                        onClick = { onAction(item.action) },
                        modifier = Modifier.alpha(if (item.action in dimmed) HOLD_DIMMED_ALPHA else 1f),
                    )
                }
            }
        }
    }
}

/**
 * Un rail qui défile n'est jamais coupé net : le bord derrière lequel des boutons attendent s'efface en fondu, et le
 * fondu se retire dès que ce bord est atteint. Un masque posé sur le dessin : il ne prend aucun toucher.
 */
private fun Modifier.callRailScrollFade(state: ScrollState): Modifier = drawWithContent {
    val behind = state.canScrollBackward
    val ahead = state.canScrollForward
    if (!behind && !ahead) {
        drawContent()
        return@drawWithContent
    }
    val fade = (RAIL_SCROLL_FADE.toPx() / size.height).coerceAtMost(0.5f)
    val stops = buildList {
        add(0f to if (behind) Color.Transparent else Color.Black)
        if (behind) add(fade to Color.Black)
        if (ahead) add(1f - fade to Color.Black)
        add(1f to if (ahead) Color.Transparent else Color.Black)
    }
    drawIntoCanvas { it.saveLayer(Rect(0f, 0f, size.width, size.height), Paint()) }
    drawContent()
    drawRect(brush = Brush.verticalGradient(*stops.toTypedArray()), blendMode = BlendMode.DstIn)
    drawIntoCanvas { it.restore() }
}
