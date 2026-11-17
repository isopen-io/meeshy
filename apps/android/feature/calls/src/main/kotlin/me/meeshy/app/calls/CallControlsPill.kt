package me.meeshy.app.calls

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallControlsDisposition
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallPillMotion
import me.meeshy.sdk.model.call.CallPillRowContent
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallPillWidth
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.ui.theme.MeeshySpacing

internal val ROWS_MAX_HEIGHT = CallGroupStageSizing.MAXIMUM_ROWS_HEIGHT_DP.dp

/** The captioned base row (glyph, legend, padding): what the stage holds under the rows. */
private val BASE_ROW_HEIGHT = 96.dp

/**
 * How tall the unfolded rows may be on this stage. On a group they yield so the grid keeps its 140 dp (P12.7): the
 * stage holds besides the rows its margins (four steps of [MeeshySpacing.xl]), the grid's own two [MeeshySpacing.md]
 * and the base row. Without a grid there is nothing to protect.
 */
internal fun callPillRowsMaxHeight(stageHeight: Dp, hasGrid: Boolean): Dp =
    if (!hasGrid) ROWS_MAX_HEIGHT
    else CallGroupStageSizing.rowsCeilingDp(stageHeight.value, STAGE_RESERVED_HEIGHT.value).dp

private val STAGE_RESERVED_HEIGHT = MeeshySpacing.xl * 4 + MeeshySpacing.md * 2 + BASE_ROW_HEIGHT

/**
 * The pill at the bottom of the call, the same in audio, video and group: (…) · Mic · Output · End.
 * On a group the (…) stacks above the base row one row per family ("My image", "The call"); on a duo it brings out two
 * rails on the edges instead and the pill does not grow (#17327, [CallControlsDisposition]). A panel drawn in the pill
 * REPLACES the rows, never stacks with them. It is ONE glass block that grows with what it holds, and each button
 * inside is its own glass disc (#17323). The captions live in it too, above the base row, and the journal opens in place
 * of them (#17343, [CallPillText]): (…) stows them, and the base row stays under the journal. When a touch stows the
 * chrome and the captions stay, THIS glass stays: its base row folds out by the same morphism that unfolds the rows, the
 * glass tightens around the captions, and the base row comes back the way it left (G1.3, laws 11 and 17). Pure
 * projection: the layer, the rows and every callback come from the caller.
 */
@Composable
internal fun CallControlsPill(
    state: CallUiState,
    layer: CallScreenLayer,
    disposition: CallControlsDisposition,
    rows: List<CallPillRowContent>,
    items: Map<CallAction, CallPillItem>,
    outputIcon: ImageVector,
    onToggleMenu: () -> Unit,
    onToggleMute: () -> Unit,
    onOutput: () -> Unit,
    onHangUp: () -> Unit,
    onAction: (CallAction) -> Unit,
    onBackToMenu: () -> Unit,
    onClosePanel: () -> Unit,
    modifier: Modifier = Modifier,
    pillText: CallPillText = CallPillText.None,
    outputKind: CallPillKind = CallPillKind.Normal,
    outputState: String? = null,
    rowsMaxHeight: Dp = ROWS_MAX_HEIGHT,
    captions: @Composable () -> Unit = {},
    panelContent: @Composable (CallScreenPanel) -> Unit = {},
) {
    val reduceMotion = rememberCallReduceMotion()
    val expanded = disposition.unfoldsPill(layer) && pillText.hasBaseRow
    // Loi 17.2 : la mise en page prend sa forme d'un coup, le VERRE en repart par une échelle (CallPillMorph.kt).
    // Loi 17.10 : Réduire les animations garde un fondu de 0,2 s, sans échelle ni glissement.
    val millis = CallPillMotion.millis(reduceMotion)
    val unfoldScale = if (!CallPillMotion.scalesOnUnfold(reduceMotion)) EnterTransition.None else
        scaleIn(initialScale = 0.94f, transformOrigin = TransformOrigin(0.5f, 1f))
    val foldScale = if (!CallPillMotion.scalesOnUnfold(reduceMotion)) ExitTransition.None else
        scaleOut(targetScale = 0.94f, transformOrigin = TransformOrigin(0.5f, 1f))
    val held = remember { HeldLayer() }
    if (expanded) held.layer = layer
    val anchor = remember { CallGlassAnchor() }
    val maxWidth = CallPillWidth.maxWidthDp(pillText, isUnfolded = expanded).dp
    CallMorphingControlsGlass(anchor = anchor, reduceMotion = reduceMotion, modifier = modifier.callPillMaxWidth(maxWidth)) {
        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn(tween(millis)) + unfoldScale,
            exit = fadeOut(tween(millis)) + foldScale,
        ) {
            // What is leaving (a panel, the rows) keeps its content until it has faded: it does not vanish at once.
            val shownLayer = if (expanded) layer else held.layer
            Column(Modifier.followingCell(CallGlassFollow(anchor, reduceMotion))) {
                UnfoldedContent(
                    panel = shownLayer.pillPanel,
                    millis = millis,
                    rowsMaxHeight = rowsMaxHeight,
                    rows = rows,
                    items = items,
                    isOnHold = state.isOnHold,
                    onAction = onAction,
                    onBackToMenu = onBackToMenu,
                    onClosePanel = onClosePanel,
                    panelContent = panelContent,
                )
                CallPillHairline()
            }
        }
        CaptionsBand(pillText, millis, CallGlassFollow(anchor, reduceMotion), captions)
        AnimatedVisibility(
            visible = pillText.hasBaseRow,
            enter = fadeIn(tween(millis)) + unfoldScale,
            exit = fadeOut(tween(millis)) + foldScale,
        ) {
            BaseRow(
                state = state,
                captioned = expanded && layer.captionsBaseRow,
                menuOpen = layer.isExpanded,
                output = CallOutputFace(outputIcon, outputKind, outputState),
                follow = CallGlassFollow(anchor, reduceMotion),
                onToggleMenu = onToggleMenu,
                onToggleMute = onToggleMute,
                onOutput = onOutput,
                onHangUp = onHangUp,
            )
        }
    }
}

/** L3.3 · #17935 — la borne de la pilule (440 → 560 dp), posée D'UN COUP : c'est le verre qui en repart (loi 17.2). */
private fun Modifier.callPillMaxWidth(maxWidth: Dp): Modifier = layout { measurable, constraints ->
    val width = maxWidth.roundToPx().coerceIn(constraints.minWidth, constraints.maxWidth)
    val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
    layout(placeable.width, placeable.height) { placeable.place(0, 0) }
}

/** What « Sortie » shows: its glyph, the state [CallOutputButtonRule] picks, and where the sound goes (TalkBack). */
private data class CallOutputFace(val icon: ImageVector, val kind: CallPillKind, val state: String?)

/** Where the base row's buttons measure their place from, to glide back when the layout moves them (loi 17.2). */
private class CallGlassFollow(val anchor: CallGlassAnchor, val reduceMotion: Boolean)

@Composable
private fun Modifier.followingCell(follow: CallGlassFollow): Modifier =
    followsCallGlass(rememberCallGlassFollower(), follow.anchor, follow.reduceMotion)

/** The captions in the pill, above its base row, and the line between them: each fades in place and follows the glass. */
@Composable
private fun ColumnScope.CaptionsBand(pillText: CallPillText, millis: Int, follow: CallGlassFollow, captions: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = pillText.showsCaptionsBand,
        enter = fadeIn(tween(millis)),
        exit = fadeOut(tween(millis)),
    ) { Box(Modifier.followingCell(follow)) { captions() } }
    // The line between the captions and the base row fades out with whichever of the two leaves, never at once.
    AnimatedVisibility(
        visible = pillText == CallPillText.Captions,
        enter = fadeIn(tween(millis)),
        exit = fadeOut(tween(millis)),
    ) { Box(Modifier.followingCell(follow)) { CallPillHairline() } }
}

/**
 * G3.2 — what the unfolded pill holds above its base row: an option drawn in the pill, the journal, or (on a group) the
 * family rows. They swap in the SAME glass by a cross-fade, never at once, while the glass morphs by a scale (loi
 * 17.2); « reduce animations » keeps a 0.2 s fade and the glass cross-fades over the same 0.2 s, never with a jump
 * (P13.12, loi 17.10). Mirrors iOS `callControlsPill` (`.animation(_, value: layer)`).
 */
@Composable
private fun UnfoldedContent(
    panel: CallScreenPanel?,
    millis: Int,
    rowsMaxHeight: Dp,
    rows: List<CallPillRowContent>,
    items: Map<CallAction, CallPillItem>,
    isOnHold: Boolean,
    onAction: (CallAction) -> Unit,
    onBackToMenu: () -> Unit,
    onClosePanel: () -> Unit,
    panelContent: @Composable (CallScreenPanel) -> Unit,
) {
    AnimatedContent(
        targetState = panel,
        transitionSpec = {
            val swap = fadeIn(tween(millis)) togetherWith fadeOut(tween(millis))
            // Loi 17.2 : aucune taille animée ; le conteneur tient les deux contenus le temps du fondu, et le verre morphe.
            swap using null
        },
        label = "callPillContent",
    ) { shown ->
        when (shown) {
            null -> FamilyRows(rows, items, isOnHold = isOnHold, maxHeight = rowsMaxHeight, onAction = onAction)
            CallScreenPanel.Journal -> panelContent(CallScreenPanel.Journal)
            else -> CallPillPanel(
                title = items[shown.action]?.let { stringResource(it.labelRes) }.orEmpty(),
                onBack = onBackToMenu,
                onClose = onClosePanel,
            ) { panelContent(shown) }
        }
    }
}

/**
 * On a group, one titled row per family, stacked above the base row; it scrolls past [maxHeight], which the stage
 * lowers to keep the grid its 140 dp (P12.7). Each button keeps its 48 dp: the rows scroll, they never squeeze.
 */
@Composable
private fun FamilyRows(
    rows: List<CallPillRowContent>,
    items: Map<CallAction, CallPillItem>,
    isOnHold: Boolean,
    maxHeight: Dp,
    onAction: (CallAction) -> Unit,
) {
    val label = stringResource(R.string.call_actions_label)
    Column(
        Modifier
            .heightIn(max = maxHeight)
            .verticalScroll(rememberScrollState())
            .semantics { contentDescription = label },
    ) {
        rows.forEach { row ->
            key(row.id) {
                CallActionRow(
                    title = callFamilyTitle(row.family),
                    items = row.actions.mapNotNull { items[it] },
                    onAction = onAction,
                    dimmed = if (isOnHold) HOLD_DIMMED_ACTIONS else emptySet(),
                )
            }
        }
    }
}

/** The layer the pill last drew unfolded: what a folding pill keeps showing while it fades (not state, never recomposes). */
private class HeldLayer {
    var layer: CallScreenLayer = CallScreenLayer.Idle
}

/**
 * The same four buttons everywhere, captioned when the captioned rows unfold above them. Each cell follows the glass:
 * when the layout moves it (a caption, the 440 → 560 dp bound), it glides back from where it was seen (loi 17.2).
 */
@Composable
private fun BaseRow(
    state: CallUiState,
    captioned: Boolean,
    menuOpen: Boolean,
    output: CallOutputFace,
    follow: CallGlassFollow,
    onToggleMenu: () -> Unit,
    onToggleMute: () -> Unit,
    onOutput: () -> Unit,
    onHangUp: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.smPlus),
    ) {
        val expandedLabel = stringResource(if (menuOpen) R.string.call_control_expanded else R.string.call_control_collapsed)
        Row(Modifier.weight(1f).followingCell(follow), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = Icons.Filled.MoreHoriz,
                kind = if (menuOpen) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(if (menuOpen) R.string.call_control_more_hide else R.string.call_control_more_show),
                hint = stringResource(R.string.call_control_more_hint),
                caption = stringResource(R.string.call_control_more_caption),
                captionShown = captioned,
                onClick = onToggleMenu,
                modifier = Modifier.semantics { stateDescription = expandedLabel },
            )
        }
        Row(
            Modifier.weight(1f).followingCell(follow).alpha(if (state.isOnHold) HOLD_DIMMED_ALPHA else 1f),
            horizontalArrangement = Arrangement.Center,
        ) {
            CallPillButton(
                icon = if (state.isMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                kind = if (state.isMuted) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(if (state.isMuted) R.string.call_control_unmute_label else R.string.call_control_mute_label),
                hint = stringResource(R.string.call_control_mute_hint),
                caption = stringResource(R.string.call_control_mute_caption),
                captionShown = captioned,
                toggleState = state.isMuted,
                onClick = onToggleMute,
            )
        }
        Row(Modifier.weight(1f).followingCell(follow), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = output.icon,
                kind = output.kind,
                label = stringResource(R.string.call_control_output_a11y),
                hint = stringResource(R.string.call_control_output_hint),
                caption = stringResource(R.string.call_audio_button),
                captionShown = captioned,
                onClick = onOutput,
                modifier = output.state?.let { where -> Modifier.semantics { stateDescription = where } } ?: Modifier,
            )
        }
        Row(Modifier.weight(1f).followingCell(follow), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = Icons.Filled.CallEnd,
                kind = CallPillKind.Destructive,
                label = stringResource(R.string.call_action_hang_up),
                hint = stringResource(R.string.call_control_end_hint),
                caption = stringResource(R.string.call_control_end_caption),
                captionShown = captioned,
                onClick = onHangUp,
            )
        }
    }
}
