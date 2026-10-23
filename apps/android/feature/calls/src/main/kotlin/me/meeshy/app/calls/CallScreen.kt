package me.meeshy.app.calls

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallStatusLabelLaw
import me.meeshy.sdk.model.call.IncomingCallAnswer
import me.meeshy.ui.theme.hexColor

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
                permissionGate.answerIncoming(config.isVideo) { answer -> answerIncoming(viewModel, answer) }
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
            delay(CallStatusLabelLaw.ENDED_AUTO_DISMISS_MILLIS)
            viewModel.dismiss()
            onClose()
        }
    }

    val accent = hexColor(DynamicColorGenerator.colorForName(config.peerId.ifBlank { config.peerName }))
    val extensions = viewModel.extensions
    val overlayContext = CallOverlayContext(state = state, accent = accent)
    val chrome = remember { CallChromeController() }
    val chromeVisibility = rememberCallChromeVisibility(chrome, state)
    val remoteVideo by viewModel.remoteVideoTracks.collectAsStateWithLifecycle(initialValue = null)
    val reduceMotion = rememberCallReduceMotion()
    val peer by viewModel.peerVisual.collectAsStateWithLifecycle()
    val avatarUrl = peer.avatarUrl
    val backdropUrl = if (remoteVideo == null) peer.backdropUrl else null
    val close = {
        viewModel.dismiss()
        onClose()
    }

    CallImmersiveEffect()
    CallStatusAnnouncer(state.status)
    BackHandler {
        when (CallPillPresenter.backAction(state.status)) {
            CallBackAction.Inert -> Unit
            CallBackAction.Minimize -> onMinimize()
            CallBackAction.Close -> close()
        }
    }

    // L'écran d'appel est blanc sur un fond sombre ÉPINGLÉ, en thème clair comme en thème sombre :
    // on épingle aussi le thème pour que les jetons de texte et de surface des enfants restent clairs.
    MeeshyTheme(darkTheme = true) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .callSwipeToMinimize(
                    enabled = CallPillPresenter.isMinimizable(state.status),
                    onMinimize = onMinimize,
                ),
            contentAlignment = Alignment.Center,
        ) {
            CallBackdrop(imageUrl = backdropUrl)

            // Un pair qui escalade l'audio en vidéo s'affiche même si l'appel est né audio.
            val videoStage = state.isVideoCall || remoteVideo != null
            if (videoStage) {
                CallDuoVideoStage(
                    state = state,
                    callKey = viewModel.activeCallId.ifBlank { config.callId }.ifBlank { config.peerId },
                    remoteTrack = remoteVideo,
                    localTrack = viewModel.localVideoTrack,
                    eglContext = viewModel.eglBaseContext,
                    peerAvatarUrl = avatarUrl,
                    connected = state.showsConnectedLayout,
                    reduceMotion = reduceMotion,
                )
            }

            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Background, overlayContext, Modifier.fillMaxSize())

            // Cet ecran n'a pas de Scaffold : il pose lui-meme l'inset des barres systeme. Le fond
            // reste PLEIN ECRAN, seul le CONTENU est retreci.
            val content = Modifier.fillMaxSize().systemBarsPadding()
            when {
                state.showsConnectedLayout || state.status == CallStatus.IDLE -> CallConnectedColumn(
                    state = state,
                    accent = accent,
                    viewModel = viewModel,
                    overlayContext = overlayContext,
                    chrome = chrome,
                    videoStage = videoStage,
                    peer = peer,
                    modifier = content,
                )
                state.status == CallStatus.INCOMING -> IncomingCallScreen(
                    state = state,
                    accent = accent,
                    peer = peer,
                    reduceMotion = reduceMotion,
                    onAccept = {
                        permissionGate.answerIncoming(config.isVideo) { answer -> answerIncoming(viewModel, answer) }
                    },
                    onDecline = viewModel::decline,
                    modifier = content,
                )
                state.status == CallStatus.OUTGOING_RINGING -> CallOutgoingRingingScreen(
                    state = state,
                    peer = peer,
                    reduceMotion = reduceMotion,
                    onHangUp = viewModel::hangUp,
                )
                state.isEnded -> CallEndedPanel(
                    state = state,
                    peer = peer,
                    onRetry = viewModel::retry,
                    onClose = close,
                    modifier = content,
                )
                else -> CallConnectingScreen(
                    state = state,
                    peer = peer,
                    reduceMotion = reduceMotion,
                    onHangUp = viewModel::hangUp,
                    modifier = content,
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
                    onReject = viewModel::rejectWaiting,
                    onAnswer = viewModel::acceptWaitingSwap,
                    modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding(),
                )
            }

            // Minimise affordance — parity with iOS's collapse-to-pill: offered only for a live,
            // non-incoming call; the Activity-scoped CallViewModel keeps the call alive.
            if (CallPillPresenter.isMinimizable(state.status)) {
                CallChromeFade(
                    isVisible = chromeVisibility.isVisible(CallChromeElement.Header),
                    onRevive = { chrome.onInteraction(CallChromeInteraction.Revive) },
                    modifier = Modifier.align(Alignment.TopStart).systemBarsPadding().padding(MeeshySpacing.sm),
                ) {
                    IconButton(onClick = onMinimize) {
                        Icon(
                            imageVector = Icons.Filled.KeyboardArrowDown,
                            contentDescription = stringResource(R.string.call_action_minimize),
                            tint = CallPalette.Ink,
                        )
                    }
                }
            }

            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Fullscreen, overlayContext, Modifier.fillMaxSize())

            CallToastHost(
                toasts = extensions.toasts.toasts,
                modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding(),
            )
        }
    }
}

/** Ce que « Accepter » devient une fois les permissions tranchées (micro refusé ⇒ raccrocher, caméra refusée ⇒ audio). */
private fun answerIncoming(viewModel: CallViewModel, answer: IncomingCallAnswer) {
    when (answer) {
        IncomingCallAnswer.HangUp -> viewModel.decline()
        IncomingCallAnswer.Answer -> viewModel.accept()
        IncomingCallAnswer.AnswerAudioOnly -> {
            viewModel.accept()
            if (viewModel.state.value.isCameraOn) viewModel.toggleCamera()
        }
    }
}
