package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Hearing
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The minimised pill's own controls — micro, sortie audio, raccrocher — so a call
 * can be muted or ended without reopening the full screen (parity with the iOS
 * `FloatingCallPillView.controlButtons`). Each button is its own TalkBack element
 * whose label says what a tap does next (« Unmute » once muted) or the current
 * output, as iOS does; the hang-up wears the error tint.
 */
@Composable
internal fun CallPillControls(
    state: CallUiState,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onHangUp: () -> Unit,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PillButton(
            icon = if (state.isMuted) Icons.Filled.MicOff else Icons.Filled.Mic,
            label = stringResource(if (state.isMuted) R.string.call_service_unmute else R.string.call_action_mute),
            active = state.isMuted,
            activeTint = MeeshyTheme.tokens.error,
            onClick = onToggleMute,
        )
        PillButton(
            icon = if (state.isSpeakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.Filled.Hearing,
            label = stringResource(if (state.isSpeakerOn) R.string.call_audio_speaker else R.string.call_audio_earpiece),
            active = state.isSpeakerOn,
            activeTint = MeeshyPalette.Indigo300,
            onClick = onToggleSpeaker,
        )
        val hangUp = stringResource(R.string.call_action_hang_up)
        IconButton(
            onClick = onHangUp,
            modifier = Modifier
                .size(PILL_BUTTON)
                .background(MeeshyTheme.tokens.error, CircleShape)
                .semantics { contentDescription = hangUp; role = Role.Button },
        ) {
            Icon(Icons.Filled.CallEnd, contentDescription = null, tint = Color.White)
        }
    }
}

@Composable
private fun PillButton(
    icon: ImageVector,
    label: String,
    active: Boolean,
    activeTint: Color,
    onClick: () -> Unit,
) {
    val tint = if (active) activeTint else MeeshyTheme.tokens.textPrimary
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(PILL_BUTTON)
            .background(tint.copy(alpha = if (active) 0.2f else 0.08f), CircleShape)
            .semantics {
                contentDescription = label
                role = Role.Button
            },
    ) {
        Icon(icon, contentDescription = null, tint = tint)
    }
}

private val PILL_BUTTON = 44.dp
