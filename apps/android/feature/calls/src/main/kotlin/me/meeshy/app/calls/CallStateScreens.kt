package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndMotive
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallFailureReason
import me.meeshy.sdk.model.call.CallStatusLabelLaw
import me.meeshy.sdk.model.call.CallHeaderLaw
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The peer block of the call screen over the VIDEO stage: the name, the status line, the
 * connection-quality bars and the notices about the other side (degraded network, muted mic,
 * camera off). The screen capture is the capsule under the header ([CallCaptureCapsule]). Pure glue — every show/hide decision is the [CallUiState]'s;
 * the [accent] is the peer's. The avatar is not here: on the video stage the picture is the peer,
 * and the audio stage shows the photo through [CallAudioStage] (#12569, one face per circle).
 */
@Composable
internal fun CallPeerBlock(state: CallUiState, accent: Color, videoStage: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = state.peerName,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Spacer(Modifier.height(MeeshySpacing.sm))
        CallStatusText(state)
        state.connectionQuality?.let { quality ->
            Spacer(Modifier.height(MeeshySpacing.sm))
            CallSignalGlyph(CallHeaderLaw.signalStrength(quality), size = 18.dp)
        }
        if (state.isPeerQualityDegraded) {
            PeerNotice(stringResource(R.string.call_peer_quality_degraded, state.peerName), MeeshyTheme.tokens.warning)
        }
        if (state.isPeerMuted && !videoStage) {
            PeerNotice(stringResource(R.string.call_peer_muted, state.peerName), MeeshyTheme.tokens.textSecondary)
        }
        if (state.isPeerCameraOff && !videoStage) {
            PeerNotice(stringResource(R.string.call_peer_camera_off, state.peerName), MeeshyTheme.tokens.textSecondary)
        }
    }
}

/** One small centered line about the other side, under the status. */
@Composable
private fun PeerNotice(text: String, color: Color) {
    Spacer(Modifier.height(MeeshySpacing.sm))
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = color,
        textAlign = TextAlign.Center,
    )
}

/** The latest live caption of the remote speaker, on a dark pill so it stays legible over any video. */
@Composable
internal fun CallCaption(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = Color.White,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.lg)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    )
}

/** La ligne d'état : seule elle lit le chrono vivant, le reste de l'écran ne bouge pas chaque seconde. */
@Composable
private fun CallStatusText(state: CallUiState) {
    Text(
        text = statusLabel(state),
        style = MaterialTheme.typography.bodyLarge,
        color = MeeshyTheme.tokens.textSecondary,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun statusLabel(state: CallUiState): String = when (state.status) {
    CallStatus.IDLE -> ""
    CallStatus.INCOMING -> stringResource(R.string.call_status_incoming)
    CallStatus.OUTGOING_RINGING -> stringResource(R.string.call_status_ringing)
    CallStatus.CONNECTING -> stringResource(R.string.call_status_connecting)
    CallStatus.CONNECTED -> state.durationLabel
        ?.let { clockLabel(liveOrFixedSeconds(state.hasLiveClock, LocalCallLiveSeconds.current, state.durationSeconds)) }
        ?: stringResource(R.string.call_status_connected)
    CallStatus.RECONNECTING -> stringResource(R.string.call_status_reconnecting, state.reconnectAttempt)
    CallStatus.ENDED -> {
        val base = endedLabel(state.endReason)
        state.durationLabel?.let { "$base · $it" } ?: base
    }
}

@Composable
internal fun endedLabel(reason: CallEndReason?): String = when (CallStatusLabelLaw.motive(reason)) {
    CallEndMotive.Local -> stringResource(R.string.call_ended_local)
    CallEndMotive.Remote -> stringResource(R.string.call_ended_remote)
    CallEndMotive.Rejected -> stringResource(R.string.call_ended_declined)
    CallEndMotive.Missed -> stringResource(R.string.call_ended_missed)
    CallEndMotive.ConnectionLost -> stringResource(R.string.call_ended_connection_lost)
    CallEndMotive.Failed -> failureLabel(reason)
}

@Composable
private fun failureLabel(reason: CallEndReason?): String =
    when (CallFailureReason.classify((reason as? CallEndReason.Failed)?.message)) {
        CallFailureReason.InitiateTimedOut -> stringResource(R.string.call_failed_initiate_timed_out)
        CallFailureReason.InitiateMalformed -> stringResource(R.string.call_failed_initiate_malformed)
        CallFailureReason.ConnectTimedOut -> stringResource(R.string.call_failed_connect_timed_out)
        CallFailureReason.JoinRefused -> stringResource(R.string.call_failed_join_refused)
        CallFailureReason.MediaSetup -> stringResource(R.string.call_failed_media_setup)
        CallFailureReason.Unknown -> stringResource(R.string.call_ended_failed)
    }
