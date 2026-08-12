package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Pure decision: *when* the minimised floating call pill is shown. Isolated from
 * the Composable so both branches are unit-tested (parity with the iOS
 * `FloatingCallPillView` display guard `displayMode == .pip && callState.isActive`).
 *
 * The pill surfaces a *live, non-incoming* call the user has navigated away from —
 * an **incoming ringing** call is never minimised (it must be answered or declined
 * on the full screen first), and the pill hides while the full-screen call surface
 * is itself on top. A settled call ([CallStatus.IDLE]/[CallStatus.ENDED]) shows no
 * pill.
 */
object CallPillPresenter {
    private val PILL_STATUSES = setOf(
        CallStatus.OUTGOING_RINGING,
        CallStatus.CONNECTING,
        CallStatus.CONNECTED,
        CallStatus.RECONNECTING,
    )

    /** A live, non-incoming call the user may minimise (drives the CallScreen chevron). */
    fun isMinimizable(status: CallStatus): Boolean = status in PILL_STATUSES

    /** The pill shows for a minimisable call only while off the full-screen call surface. */
    fun shouldShow(status: CallStatus, onCallScreen: Boolean): Boolean =
        isMinimizable(status) && !onCallScreen
}

/**
 * The minimised call pill — a full-width banner pinned to the top of the app
 * (parity with iOS `FloatingCallPillView`, WhatsApp-style). It shows the peer, a
 * colour-coded status line (green duration once connected, amber while ringing /
 * connecting, red while reconnecting) and a phone / video glyph. Tapping it
 * re-opens the full-screen call ([onClick]); the underlying, Activity-scoped
 * [CallViewModel] keeps the call alive across the navigation.
 *
 * Pure glue: every value is derived from the immutable [state]; the accent is
 * resolved from the peer identity for colour coherence (the conversation-accent
 * rule).
 */
@Composable
fun CallPill(
    state: CallUiState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = hexColor(DynamicColorGenerator.colorForName(state.peerName))
    val ongoingLabel = stringResource(R.string.call_pill_ongoing, state.peerName)
    val reopenLabel = stringResource(R.string.call_pill_reopen)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md)
            .clip(RoundedCornerShape(MeeshyRadius.xxl))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .clickable(onClickLabel = reopenLabel, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics { contentDescription = ongoingLabel },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.Start),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(accent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = state.peerName.take(1).uppercase(),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = state.peerName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = pillStatusLine(state),
                style = MaterialTheme.typography.bodySmall,
                color = pillStatusColor(state.status),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Icon(
            imageVector = if (state.isVideoCall) Icons.Filled.Videocam else Icons.Filled.Call,
            contentDescription = null,
            tint = accent,
        )
    }
}

/**
 * Second line of the pill: the live duration once connected, otherwise the coarse
 * phase (ringing / connecting / reconnecting). Mirrors [CallScreen]'s `statusLabel`
 * for the minimisable phases; a non-minimisable status never reaches the pill.
 */
@Composable
private fun pillStatusLine(state: CallUiState): String = when (state.status) {
    CallStatus.CONNECTED -> state.durationLabel ?: stringResource(R.string.call_status_connected)
    CallStatus.OUTGOING_RINGING -> stringResource(R.string.call_status_ringing)
    CallStatus.CONNECTING -> stringResource(R.string.call_status_connecting)
    CallStatus.RECONNECTING -> stringResource(R.string.call_status_reconnecting, state.reconnectAttempt)
    else -> stringResource(R.string.call_status_connected)
}

@Composable
private fun pillStatusColor(status: CallStatus): Color = when (status) {
    CallStatus.CONNECTED -> MeeshyTheme.tokens.success
    CallStatus.RECONNECTING -> MeeshyTheme.tokens.error
    CallStatus.OUTGOING_RINGING, CallStatus.CONNECTING -> MeeshyTheme.tokens.warning
    else -> MeeshyTheme.tokens.textSecondary
}
