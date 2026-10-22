package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The controls of the call: the base row (mute, speaker, camera, answer / decline,
 * hang up, retry, close — whichever the phase offers) and, above it, the actions
 * the registered capabilities offer ([extraActions], from the `CallActionDispatcher`).
 * With no capability registered the extra row is absent and the base row is laid
 * out exactly as it always was. Pure glue: every show/hide decision is the
 * [CallUiState]'s, every tap goes up.
 */
@Composable
internal fun CallControlsRow(
    state: CallUiState,
    accent: Color,
    extraActions: List<OfferedCallAction>,
    onExtraAction: (CallAction) -> Unit,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onHangUp: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleCamera: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onClose: () -> Unit,
    onRetry: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(bottom = MeeshySpacing.xl),
    ) {
        if (extraActions.isNotEmpty()) {
            CallExtraActions(extraActions, accent, onExtraAction)
            Spacer(Modifier.height(MeeshySpacing.md))
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xl, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.canToggleMedia) {
                CallToggleButton(
                    on = !state.isMuted,
                    onIcon = Icons.Filled.Mic,
                    offIcon = Icons.Filled.MicOff,
                    contentDescription = stringResource(R.string.call_action_mute),
                    onClick = onToggleMute,
                )
                CallToggleButton(
                    on = state.isSpeakerOn,
                    onIcon = Icons.Filled.VolumeUp,
                    offIcon = Icons.Filled.VolumeOff,
                    contentDescription = stringResource(R.string.call_action_speaker),
                    onClick = onToggleSpeaker,
                )
                if (state.isVideoCall) {
                    CallToggleButton(
                        on = state.isCameraOn,
                        onIcon = Icons.Filled.Videocam,
                        offIcon = Icons.Filled.VideocamOff,
                        contentDescription = stringResource(R.string.call_action_camera),
                        onClick = onToggleCamera,
                    )
                }
            }

            if (state.showAnswerControls) {
                CallCircleButton(
                    icon = Icons.Filled.Call,
                    background = accent,
                    contentDescription = stringResource(R.string.call_action_accept),
                    onClick = onAccept,
                )
                CallCircleButton(
                    icon = Icons.Filled.CallEnd,
                    background = MaterialTheme.colorScheme.error,
                    contentDescription = stringResource(R.string.call_action_decline),
                    onClick = onDecline,
                )
            }

            if (state.showHangUp) {
                CallCircleButton(
                    icon = Icons.Filled.CallEnd,
                    background = MaterialTheme.colorScheme.error,
                    contentDescription = stringResource(R.string.call_action_hang_up),
                    onClick = onHangUp,
                )
            }

            if (state.canRetry) {
                // A transient failure — offer « Réessayer » (re-initiates the same
                // call) beside the close button. Parité web retry-on-failure.
                CallCircleButton(
                    icon = if (state.isVideoCall) Icons.Filled.Videocam else Icons.Filled.Call,
                    background = MeeshyTheme.tokens.success,
                    contentDescription = stringResource(R.string.call_action_retry),
                    onClick = onRetry,
                )
            }

            if (state.isEnded) {
                CallCircleButton(
                    icon = Icons.Filled.CallEnd,
                    background = MeeshyTheme.tokens.textSecondary,
                    contentDescription = stringResource(R.string.call_action_close),
                    onClick = onClose,
                )
            }
        }
    }
}

/** The actions capabilities contribute, as a row of toggles tinted with the accent while on. */
@Composable
private fun CallExtraActions(
    actions: List<OfferedCallAction>,
    accent: Color,
    onAction: (CallAction) -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        actions.forEach { offered ->
            IconButton(
                onClick = { onAction(offered.action) },
                modifier = Modifier.semantics { selected = offered.presentation.isActive },
            ) {
                Icon(
                    imageVector = offered.presentation.icon,
                    contentDescription = stringResource(offered.presentation.labelRes),
                    tint = if (offered.presentation.isActive) accent else MeeshyTheme.tokens.textPrimary,
                )
            }
        }
    }
}

@Composable
internal fun CallToggleButton(
    on: Boolean,
    onIcon: ImageVector,
    offIcon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick) {
        Icon(
            imageVector = if (on) onIcon else offIcon,
            contentDescription = contentDescription,
            tint = MeeshyTheme.tokens.textPrimary,
        )
    }
}

@Composable
internal fun CallCircleButton(
    icon: ImageVector,
    background: Color,
    contentDescription: String,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .background(background),
    ) {
        Icon(imageVector = icon, contentDescription = contentDescription, tint = Color.White)
    }
}
