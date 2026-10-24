package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndMotive
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallStatusLabelLaw
import me.meeshy.sdk.model.call.ConnectionQuality
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The peer block of the call screen over the VIDEO stage: the name, the status line, the
 * connection-quality bars and the notices about the other side (degraded network, screen
 * capture, muted mic, camera off). Pure glue — every show/hide decision is the [CallUiState]'s;
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
        Text(
            text = statusLabel(state),
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        state.connectionQuality?.let { quality ->
            Spacer(Modifier.height(MeeshySpacing.sm))
            ConnectionQualityBars(quality = quality, accent = accent)
        }
        if (state.isPeerQualityDegraded) {
            PeerNotice(stringResource(R.string.call_peer_quality_degraded, state.peerName), MeeshyTheme.tokens.warning)
        }
        if (state.isPeerScreenCapturing) {
            PeerNotice(stringResource(R.string.call_peer_screen_capturing, state.peerName), MeeshyTheme.tokens.error)
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

@Composable
private fun statusLabel(state: CallUiState): String = when (state.status) {
    CallStatus.IDLE -> ""
    CallStatus.INCOMING -> stringResource(R.string.call_status_incoming)
    CallStatus.OUTGOING_RINGING -> stringResource(R.string.call_status_ringing)
    CallStatus.CONNECTING -> stringResource(R.string.call_status_connecting)
    CallStatus.CONNECTED -> state.durationLabel ?: stringResource(R.string.call_status_connected)
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
    CallEndMotive.Failed -> stringResource(R.string.call_ended_failed)
}

/**
 * A subtle 4-bar signal indicator for the live [ConnectionQuality] — bars fill
 * up to [ConnectionQuality.bars], tinted the peer accent, or the error hue on a
 * weak link. A single VoiceOver label describes the tier (the bars themselves
 * are decorative). Accent-coherent per the conversation colour rule.
 */
@Composable
private fun ConnectionQualityBars(quality: ConnectionQuality, accent: Color) {
    val filledColor = if (quality.isWeak) MaterialTheme.colorScheme.error else accent
    val emptyColor = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.3f)
    val description = qualityDescription(quality)
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.Bottom,
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        val heights = listOf(6.dp, 10.dp, 14.dp, 18.dp)
        heights.forEachIndexed { index, barHeight ->
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(barHeight)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (index < quality.bars) filledColor else emptyColor),
            )
        }
    }
}

@Composable
private fun qualityDescription(quality: ConnectionQuality): String = when (quality) {
    ConnectionQuality.EXCELLENT -> stringResource(R.string.call_quality_excellent)
    ConnectionQuality.GOOD -> stringResource(R.string.call_quality_good)
    ConnectionQuality.FAIR -> stringResource(R.string.call_quality_fair)
    ConnectionQuality.POOR -> stringResource(R.string.call_quality_poor)
}
