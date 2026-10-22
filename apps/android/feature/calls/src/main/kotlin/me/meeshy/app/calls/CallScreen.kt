package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private const val CALL_ENDED_AUTO_DISMISS_MS = 1500L

/**
 * The minimal 1:1 call screen — pure glue over [CallViewModel]. It starts the
 * call once for the supplied [config], renders the current phase, and offers the
 * accept/decline/hang-up/mute/camera affordances the state exposes. Dismissal on
 * a settled call returns to the caller via [onClose] (natural back-out, coherent
 * place). The accent is derived from the peer identity for colour coherence.
 *
 * It owns the geometry and nothing else: what capabilities add to the call — a
 * layer in a [CallOverlaySlot], an action on the controls, a toast — comes from
 * the view model's `extensions`, so adding one never edits this file.
 */
@Composable
fun CallScreen(
    config: CallConfig,
    onClose: () -> Unit,
    onMinimize: () -> Unit = {},
    /** Bouton « Répondre » de la notification : décrocher dès l'arrivée (gated permissions). */
    autoAnswer: Boolean = false,
    viewModel: CallViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val permissionGate = rememberCallPermissionGate(config.isVideo)

    LaunchedEffect(config.peerId, config.isOutgoing, config.isVideo) {
        if (config.isOutgoing) {
            permissionGate.withMediaPermissions { viewModel.start(config) }
        } else {
            viewModel.start(config)
            // Bouton « Répondre » de la notification : décrocher directement —
            // même chemin gated permissions que le bouton Accepter de l'écran.
            // Gardé sur INCOMING : une ré-entrée (second tap de notification,
            // onNewIntent) sur un appel déjà décroché ne re-join jamais.
            if (autoAnswer && viewModel.state.value.status == CallStatus.INCOMING) {
                permissionGate.withMediaPermissions { viewModel.accept() }
            }
        }
    }

    // Auto-dismiss a settled call after a short beat so the "Call ended" screen does
    // not linger (parity with iOS's 1.5 s settle → full-screen cover close). The
    // manual close button on the ended view remains for an immediate back-out.
    // A RETRYABLE failure keeps the screen up: the user must have time to tap
    // « Réessayer » (parity web retry-on-failure) — auto-dismiss would yank it.
    LaunchedEffect(state.isEnded, state.canRetry) {
        if (state.isEnded && !state.canRetry) {
            delay(CALL_ENDED_AUTO_DISMISS_MS)
            viewModel.dismiss()
            onClose()
        }
    }

    val accent = hexColor(DynamicColorGenerator.colorForName(config.peerId.ifBlank { config.peerName }))
    val extensions = viewModel.extensions
    val overlayContext = CallOverlayContext(state = state, accent = accent)
    val extraActions = remember(state) { extensions.actions.offered(state) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary),
        contentAlignment = Alignment.Center,
    ) {
        if (state.isVideoCall) CallVideoLayers(viewModel)

        CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Background, overlayContext, Modifier.fillMaxSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                // Cet ecran n'a pas de Scaffold : depuis que le Scaffold racine ne
                // reserve plus les barres systeme (MeeshyApp.kt, contentWindowInsets
                // a zero), il pose lui-meme son inset. Le fond reste PLEIN ECRAN,
                // seul le CONTENU est retreci — c'est exactement la geometrie
                // d'avant, le degrade en plus.
                .systemBarsPadding()
                .padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.height(MeeshySpacing.xl))

            CallPeerBlock(state = state, accent = accent)

            state.captionText?.let { caption -> CallCaption(caption) }
            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Captions, overlayContext)
            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.AboveControls, overlayContext)

            CallControlsRow(
                state = state,
                accent = accent,
                extraActions = extraActions,
                onExtraAction = { extensions.actions.dispatch(it) },
                onAccept = { permissionGate.withMediaPermissions { viewModel.accept() } },
                onDecline = viewModel::decline,
                onHangUp = viewModel::hangUp,
                onToggleMute = viewModel::toggleMute,
                onToggleCamera = viewModel::toggleCamera,
                onToggleSpeaker = viewModel::toggleSpeaker,
                onClose = {
                    viewModel.dismiss()
                    onClose()
                },
                onRetry = viewModel::retry,
            )
        }

        CallOverlaySlotHost(
            extensions.overlays, CallOverlaySlot.Center, overlayContext,
            Modifier.align(Alignment.Center),
        )
        CallOverlaySlotHost(
            extensions.overlays, CallOverlaySlot.Panel, overlayContext,
            Modifier.align(Alignment.BottomCenter).systemBarsPadding(),
        )
        CallOverlaySlotHost(
            extensions.overlays, CallOverlaySlot.TopBanner, overlayContext,
            Modifier.align(Alignment.TopCenter).systemBarsPadding(),
        )

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

        CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Fullscreen, overlayContext, Modifier.fillMaxSize())

        CallToastHost(
            toasts = extensions.toasts.toasts,
            modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding(),
        )
    }
}

/** The remote picture full-screen and the local preview as a mirrored picture-in-picture, top end. */
@Composable
private fun BoxScope.CallVideoLayers(viewModel: CallViewModel) {
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
