package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallPillRowContent
import me.meeshy.sdk.model.call.CallScreenLayer
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.ui.theme.MeeshySpacing

private const val UNFOLD_MILLIS = 250
private val ROWS_MAX_HEIGHT = 340.dp

/**
 * The pill at the bottom of the call, the same in audio, video and group: (…) · Mic · Output · End.
 * The (…) stacks above the base row one row per family ("My image", "The call"); a panel drawn in
 * the pill REPLACES the rows, never stacks with them. It is ONE glass block that grows with what
 * it holds. Pure projection: the layer, the rows and every callback come from the caller.
 */
@Composable
internal fun CallControlsPill(
    state: CallUiState,
    layer: CallScreenLayer,
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
    panelContent: @Composable (CallScreenPanel) -> Unit = {},
) {
    val reduceMotion = rememberCallReduceMotion()
    val expanded = layer.isExpanded
    val unfoldScale = if (reduceMotion) EnterTransition.None else
        scaleIn(initialScale = 0.94f, transformOrigin = TransformOrigin(0.5f, 1f))
    CallControlsGlass(modifier = modifier.widthIn(max = 440.dp).fillMaxWidth()) {
        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn(tween(UNFOLD_MILLIS)) + unfoldScale,
            exit = fadeOut(tween(UNFOLD_MILLIS)),
        ) {
            Column {
                val panel = layer.pillPanel
                if (panel != null) {
                    CallPillPanel(
                        title = items[panel.action]?.let { stringResource(it.labelRes) }.orEmpty(),
                        onBack = onBackToMenu,
                        onClose = onClosePanel,
                    ) { panelContent(panel) }
                } else if (layer.showsFamilyRows) {
                    val label = stringResource(R.string.call_actions_label)
                    Column(
                        Modifier
                            .heightIn(max = ROWS_MAX_HEIGHT)
                            .verticalScroll(rememberScrollState())
                            .semantics { contentDescription = label },
                    ) {
                        rows.forEach { row ->
                            key(row.id) {
                                CallActionRow(
                                    title = callFamilyTitle(row.family),
                                    items = row.actions.mapNotNull { items[it] },
                                    onAction = onAction,
                                )
                            }
                        }
                    }
                }
                CallPillHairline()
            }
        }
        BaseRow(state, expanded, outputIcon, onToggleMenu, onToggleMute, onOutput, onHangUp)
    }
}

@Composable
private fun BaseRow(
    state: CallUiState,
    captioned: Boolean,
    outputIcon: ImageVector,
    onToggleMenu: () -> Unit,
    onToggleMute: () -> Unit,
    onOutput: () -> Unit,
    onHangUp: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.Top,
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.smPlus),
    ) {
        val expandedLabel = stringResource(if (captioned) R.string.call_control_expanded else R.string.call_control_collapsed)
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = Icons.Filled.MoreHoriz,
                kind = if (captioned) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(R.string.call_control_more),
                hint = stringResource(R.string.call_control_more_hint),
                caption = if (captioned) stringResource(R.string.call_control_more_caption) else null,
                onClick = onToggleMenu,
                modifier = Modifier.semantics { stateDescription = expandedLabel },
            )
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = if (state.isMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
                kind = if (state.isMuted) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(if (state.isMuted) R.string.call_control_unmute_label else R.string.call_control_mute_label),
                hint = stringResource(R.string.call_control_mute_hint),
                caption = if (captioned) stringResource(R.string.call_control_mute_caption) else null,
                toggleState = state.isMuted,
                onClick = onToggleMute,
            )
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = outputIcon,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_audio_button),
                hint = stringResource(R.string.call_control_output_hint),
                caption = if (captioned) stringResource(R.string.call_audio_button) else null,
                onClick = onOutput,
            )
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center) {
            CallPillButton(
                icon = Icons.Filled.CallEnd,
                kind = CallPillKind.Destructive,
                label = stringResource(R.string.call_action_hang_up),
                hint = stringResource(R.string.call_control_end_hint),
                caption = if (captioned) stringResource(R.string.call_control_end_caption) else null,
                onClick = onHangUp,
            )
        }
    }
}
