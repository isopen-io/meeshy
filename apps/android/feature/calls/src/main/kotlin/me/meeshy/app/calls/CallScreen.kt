package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The minimal 1:1 call screen — pure glue over [CallViewModel]. It starts the
 * call once for the supplied [config], renders the current phase, and offers the
 * accept/decline/hang-up/mute/camera affordances the state exposes. Dismissal on
 * a settled call returns to the caller via [onClose] (natural back-out, coherent
 * place). The accent is derived from the peer identity for colour coherence.
 */
@Composable
fun CallScreen(
    config: CallConfig,
    onClose: () -> Unit,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(config.peerId, config.isOutgoing, config.isVideo) {
        viewModel.start(config)
    }

    val accent = hexColor(DynamicColorGenerator.colorForName(config.peerId.ifBlank { config.peerName }))

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.height(MeeshySpacing.xl))

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .clip(CircleShape)
                        .background(accent),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = state.peerName.take(1).uppercase(),
                        style = MaterialTheme.typography.headlineLarge,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.height(MeeshySpacing.lg))
                Text(
                    text = state.peerName,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                Spacer(Modifier.height(MeeshySpacing.sm))
                Text(
                    text = statusLabel(state),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MeeshyTheme.tokens.textSecondary,
                    textAlign = TextAlign.Center,
                )
            }

            CallControls(
                state = state,
                accent = accent,
                onAccept = viewModel::accept,
                onDecline = viewModel::decline,
                onHangUp = viewModel::hangUp,
                onToggleMute = viewModel::toggleMute,
                onToggleCamera = viewModel::toggleCamera,
                onClose = {
                    viewModel.dismiss()
                    onClose()
                },
            )
        }
    }
}

@Composable
private fun statusLabel(state: CallUiState): String = when (state.status) {
    CallStatus.IDLE -> ""
    CallStatus.INCOMING -> stringResource(R.string.call_status_incoming)
    CallStatus.OUTGOING_RINGING -> stringResource(R.string.call_status_ringing)
    CallStatus.CONNECTING -> stringResource(R.string.call_status_connecting)
    CallStatus.CONNECTED -> stringResource(R.string.call_status_connected)
    CallStatus.RECONNECTING -> stringResource(R.string.call_status_reconnecting, state.reconnectAttempt)
    CallStatus.ENDED -> endedLabel(state.endReason)
}

@Composable
private fun endedLabel(reason: CallEndReason?): String = when (reason) {
    CallEndReason.Missed -> stringResource(R.string.call_ended_missed)
    CallEndReason.Rejected -> stringResource(R.string.call_ended_declined)
    CallEndReason.ConnectionLost -> stringResource(R.string.call_ended_connection_lost)
    is CallEndReason.Failed -> stringResource(R.string.call_ended_failed)
    else -> stringResource(R.string.call_ended)
}

@Composable
private fun CallControls(
    state: CallUiState,
    accent: Color,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onHangUp: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleCamera: () -> Unit,
    onClose: () -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xl, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(bottom = MeeshySpacing.xl),
    ) {
        if (state.canToggleMedia) {
            CallToggleButton(
                on = !state.isMuted,
                onIcon = Icons.Filled.Mic,
                offIcon = Icons.Filled.MicOff,
                contentDescription = stringResource(R.string.call_action_mute),
                onClick = onToggleMute,
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

@Composable
private fun CallToggleButton(
    on: Boolean,
    onIcon: androidx.compose.ui.graphics.vector.ImageVector,
    offIcon: androidx.compose.ui.graphics.vector.ImageVector,
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
private fun CallCircleButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
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
