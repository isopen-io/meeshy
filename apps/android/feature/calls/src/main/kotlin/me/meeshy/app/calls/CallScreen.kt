package me.meeshy.app.calls

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.KeyboardArrowDown
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.ConnectionQuality
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private const val CALL_ENDED_AUTO_DISMISS_MS = 1500L

private fun hasSelfPermission(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

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
    onMinimize: () -> Unit = {},
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Runtime media permissions (mic always, camera for video). WebRTC capture
    // records silence / fails without RECORD_AUDIO, and it is never granted by
    // default. Mirrors iOS, where AVAudioSession prompts for the mic at first media
    // access: an OUTGOING call gates its start on the grant; an INCOMING call rings
    // first (no prompt) and gates accept — matching iOS's ask-at-answer flow.
    val context = LocalContext.current
    val requiredPermissions = remember(config.isVideo) { CallPermissions.required(config.isVideo) }
    val pendingMediaAction = remember { mutableStateOf<(() -> Unit)?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        // The mic is the vital minimum; the camera is optional (video degrades to audio).
        val micGranted = grants[Manifest.permission.RECORD_AUDIO]
            ?: hasSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        if (micGranted) pendingMediaAction.value?.invoke()
        pendingMediaAction.value = null
    }

    fun withMediaPermissions(action: () -> Unit) {
        if (hasSelfPermission(context, Manifest.permission.RECORD_AUDIO)) {
            action()
        } else {
            pendingMediaAction.value = action
            permissionLauncher.launch(requiredPermissions)
        }
    }

    LaunchedEffect(config.peerId, config.isOutgoing, config.isVideo) {
        if (config.isOutgoing) withMediaPermissions { viewModel.start(config) } else viewModel.start(config)
    }

    // Auto-dismiss a settled call after a short beat so the "Call ended" screen does
    // not linger (parity with iOS's 1.5 s settle → full-screen cover close). The
    // manual close button on the ended view remains for an immediate back-out.
    LaunchedEffect(state.isEnded) {
        if (state.isEnded) {
            delay(CALL_ENDED_AUTO_DISMISS_MS)
            viewModel.dismiss()
            onClose()
        }
    }

    val accent = hexColor(DynamicColorGenerator.colorForName(config.peerId.ifBlank { config.peerName }))

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary),
        contentAlignment = Alignment.Center,
    ) {
        if (state.isVideoCall) {
            val remoteVideo by viewModel.remoteVideoTracks.collectAsStateWithLifecycle(initialValue = null)
            remoteVideo?.let { track ->
                VideoRenderer(
                    track = track,
                    eglContext = viewModel.eglBaseContext,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            viewModel.localVideoTrack?.let { local ->
                VideoRenderer(
                    track = local,
                    eglContext = viewModel.eglBaseContext,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(MeeshySpacing.lg)
                        .size(width = 108.dp, height = 148.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.md)),
                    mirror = true,
                    overlay = true,
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.height(MeeshySpacing.xl))

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (!state.isVideoCall) {
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
                }
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
                    Spacer(Modifier.height(MeeshySpacing.sm))
                    Text(
                        text = stringResource(R.string.call_peer_quality_degraded, state.peerName),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.warning,
                        textAlign = TextAlign.Center,
                    )
                }
                if (state.isPeerScreenCapturing) {
                    Spacer(Modifier.height(MeeshySpacing.sm))
                    Text(
                        text = stringResource(R.string.call_peer_screen_capturing, state.peerName),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.error,
                        textAlign = TextAlign.Center,
                    )
                }
                if (state.isPeerMuted) {
                    Spacer(Modifier.height(MeeshySpacing.sm))
                    Text(
                        text = stringResource(R.string.call_peer_muted, state.peerName),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
                if (state.isPeerCameraOff) {
                    Spacer(Modifier.height(MeeshySpacing.sm))
                    Text(
                        text = stringResource(R.string.call_peer_camera_off, state.peerName),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            state.captionText?.let { caption ->
                Text(
                    text = caption,
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

            CallControls(
                state = state,
                accent = accent,
                onAccept = { withMediaPermissions { viewModel.accept() } },
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

        state.waitingBanner?.let { banner ->
            CallWaitingBanner(
                banner = banner,
                accent = accent,
                onReject = viewModel::rejectWaiting,
                onAnswer = viewModel::acceptWaitingSwap,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }

        // Minimise affordance — parity with iOS's collapse-to-pill. Offered only
        // for a live, non-incoming call (the same phases that surface the floating
        // pill); [onMinimize] opens the conversation while the Activity-scoped
        // CallViewModel keeps the call alive. On a video call the chevron rides the
        // remote feed, so it stays white for contrast.
        if (CallPillPresenter.isMinimizable(state.status)) {
            IconButton(
                onClick = onMinimize,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(MeeshySpacing.sm),
            ) {
                Icon(
                    imageVector = Icons.Filled.KeyboardArrowDown,
                    contentDescription = stringResource(R.string.call_action_minimize),
                    tint = if (state.isVideoCall) Color.White else MeeshyTheme.tokens.textPrimary,
                )
            }
        }
    }
}

/**
 * The call-waiting banner: a second incoming call arrived while this one is
 * active. Pinned to the top, it offers *Decline* (end the waiting call, keep this
 * one) and *Answer* (end this call and take the waiting one). Colour-coherent with
 * the call controls — the answer action carries the peer [accent], the reject the
 * semantic error hue. Pure glue: every decision lives in [CallViewModel].
 */
@Composable
private fun CallWaitingBanner(
    banner: WaitingBannerUi,
    accent: Color,
    onReject: () -> Unit,
    onAnswer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bannerLabel = stringResource(R.string.call_waiting_banner_a11y, banner.callerName)
    Row(
        modifier = modifier
            .padding(MeeshySpacing.md)
            .clip(RoundedCornerShape(16.dp))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .semantics { contentDescription = bannerLabel },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.Start),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.width(140.dp)) {
            Text(
                text = banner.callerName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.call_waiting_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
        CallCircleButton(
            icon = Icons.Filled.CallEnd,
            background = MaterialTheme.colorScheme.error,
            contentDescription = stringResource(R.string.call_waiting_reject_a11y, banner.callerName),
            onClick = onReject,
        )
        CallCircleButton(
            icon = Icons.Filled.Call,
            background = accent,
            contentDescription = stringResource(R.string.call_waiting_answer_a11y, banner.callerName),
            onClick = onAnswer,
        )
    }
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
private fun endedLabel(reason: CallEndReason?): String = when (reason) {
    CallEndReason.Missed -> stringResource(R.string.call_ended_missed)
    CallEndReason.Rejected -> stringResource(R.string.call_ended_declined)
    CallEndReason.ConnectionLost -> stringResource(R.string.call_ended_connection_lost)
    is CallEndReason.Failed -> stringResource(R.string.call_ended_failed)
    else -> stringResource(R.string.call_ended)
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
