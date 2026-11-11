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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import androidx.compose.runtime.CompositionLocalProvider
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.model.call.CallPreflightDecision
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.sdk.model.call.CallStatusLabelLaw
import me.meeshy.sdk.model.call.IncomingCallAnswer
import me.meeshy.sdk.model.call.group.GroupCallStageFocus
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
    /** #17329 — le bouton Conversation de l'en-tête OUVRE la conversation (il ne réduit pas l'appel). */
    onOpenConversation: () -> Unit = onMinimize,
    /** Bouton « Répondre » de la notification : décrocher dès l'arrivée (gated permissions). */
    autoAnswer: Boolean = false,
    viewModel: CallViewModel = hiltViewModel(),
) {
    // L'écran voit un état à chrono GELÉ : un tic de 1 Hz ne le recompose pas. Le temps vivant
    // voyage en `State` (LocalCallLiveSeconds) et n'est lu que par les feuilles qui l'affichent.
    val callState by remember(viewModel) { viewModel.state.map(CallUiState::withFrozenClock).distinctUntilChanged() }
        .collectAsStateWithLifecycle(initialValue = viewModel.state.value.withFrozenClock())
    // Les sous-titres (#13333) entrent dans l'état que l'écran dessine : le bouton s'allume au toucher.
    val captionsViewModel: CallCaptionsViewModel = hiltViewModel()
    val captionsChip by remember(captionsViewModel) { captionsViewModel.state.map(CallCaptionsChip::of).distinctUntilChanged() }
        .collectAsStateWithLifecycle(initialValue = CallCaptionsChip.of(captionsViewModel.state.value))
    // Le principal parti d'un groupe qui continue, l'appel se nomme par ceux qui restent (#13754, iOS #9091) : le
    // ViewModel le sert déjà dans `peerName`, que la pilule et la notification lisent aussi (#13768).
    val groupMesh by viewModel.groupMesh.collectAsStateWithLifecycle()
    val state = callState.withCaptions(captionsChip)
    val liveSeconds = remember(viewModel) { viewModel.state.map { it.durationSeconds }.distinctUntilChanged() }
        .collectAsStateWithLifecycle(initialValue = viewModel.state.value.durationSeconds)
    val permissionGate = rememberCallPermissionGate()
    val declineReply: CallDeclineReplyViewModel = hiltViewModel()
    val pipViewModel: CallPictureInPictureViewModel = hiltViewModel()
    val autoAnswerGate: IncomingAutoAnswerViewModel = hiltViewModel()
    val inPip by pipViewModel.inPip.collectAsStateWithLifecycle()
    val headerConversationId = config.conversationId.ifBlank { viewModel.activeConfig.conversationId }
    val headerNames by rememberCallHeaderNames(headerConversationId)
    DisposableEffect(pipViewModel) {
        pipViewModel.callScreenShown(true)
        onDispose { pipViewModel.callScreenShown(false) }
    }

    LaunchedEffect(config.peerId, config.isOutgoing, config.isVideo) {
        if (config.isOutgoing) {
            permissionGate.preflightOutgoing(config.isVideo) { decision ->
                viewModel.startAfterPreflight(config, decision)
                if (decision == CallPreflightDecision.MicrophoneDenied) onClose()
            }
        } else {
            viewModel.start(config)
            // Bouton « Répondre » de la notification : décrocher directement —
            // même chemin gated permissions que le bouton Accepter de l'écran.
            // Gardé sur INCOMING : une ré-entrée (second tap de notification,
            // onNewIntent) sur un appel déjà décroché ne re-join jamais. Et seulement l'appel que la
            // passerelle tient pour en cours sous cet identifiant, jamais un callId arbitraire (#13504) :
            // la sonde passe d'abord, le statut se relit après (l'utilisateur a pu refuser entre-temps).
            if (autoAnswer && autoAnswerGate.confirms(config) && viewModel.state.value.status == CallStatus.INCOMING) {
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
    permissionGate.flow?.let { PermissionFlowHost(it, accent = accent) }
    val extensions = viewModel.extensions
    val chrome = remember { CallChromeController() }
    val chromeVisibility = rememberCallChromeVisibility(chrome, state)
    val remoteVideo by viewModel.remoteVideoTracks.collectAsStateWithLifecycle(initialValue = null)
    val groupShown = groupStageShown(state, groupMesh)
    val reduceMotion = rememberCallReduceMotion()
    val peer by viewModel.peerVisual.collectAsStateWithLifecycle()
    val preview by viewModel.previewUi.collectAsStateWithLifecycle()
    val avatarUrl = peer.avatarUrl
    val backdropUrl = if (remoteVideo == null) peer.backdropUrl else null
    val close = {
        viewModel.dismiss()
        onClose()
    }

    CallImmersiveEffect()
    CallStatusAnnouncer(state.status)
    ScreenShareFoldsCall(onMinimize)
    BackHandler {
        when (CallPillPresenter.backAction(state.status)) {
            CallBackAction.Inert -> Unit
            CallBackAction.Minimize -> onMinimize()
            CallBackAction.Close -> close()
        }
    }
    val chromeState by chrome.state.collectAsStateWithLifecycle()
    val overlayContext = CallOverlayContext(
        state = state,
        accent = accent,
        activeMode = chromeState.layer.activeMode,
        chrome = chromeVisibility,
        onChromeRevive = { chrome.onInteraction(CallChromeInteraction.Revive) },
    )
    BackHandler(enabled = chromeState.layer.activeMode != null) { chrome.exitMode() }
    LaunchedEffect(captionsViewModel, chrome) { captionsViewModel.journalRequests.collect { chrome.open(CallScreenPanel.Journal) } }

    val duo = rememberCallDuoStage(
        state = state,
        viewModel = viewModel,
        config = config,
        activeMode = chromeState.layer.activeMode,
        groupShown = groupShown,
        hasRemoteVideo = remoteVideo != null,
        reduceMotion = reduceMotion,
    )
    var groupFocus by remember { mutableStateOf<GroupCallStageFocus>(GroupCallStageFocus.Grid) }
    // Loi 3 : sur un écran partagé reçu (contenu clair), le verre de l'en-tête, de la pilule et des rails s'assombrit.
    val glassTone = callGlassTone(groupShown, state.isPeerScreenSharing, duo, chromeState.layer.activeMode, groupFocus)

    // L'écran d'appel est blanc sur un fond sombre ÉPINGLÉ, en thème clair comme en thème sombre :
    // on épingle aussi le thème pour que les jetons de texte et de surface des enfants restent clairs.
    MeeshyTheme(darkTheme = true) {
        CompositionLocalProvider(LocalCallLiveSeconds provides liveSeconds, LocalCallGlassTone provides glassTone) {
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

            val touchExploration = rememberCallTouchExploration()
            val videoScene = callIsVideoStage(state)
            val sceneTap = remember(chrome, videoScene, touchExploration) {
                if (CallChromeVisibility.mayToggleByTap(videoScene, touchExploration)) {
                    { chrome.onSceneTap(videoScene, touchExploration) }
                } else {
                    null
                }
            }
            val selfCamera = remember(viewModel) {
                CallSelfCameraActions(viewModel.cameraZoom)
            }
            val pill = rememberCallPillActions(state, viewModel, chrome)
            if (duo.shown) {
                CallDuoVideoStage(
                    state = state,
                    callKey = duo.callKey,
                    remoteTrack = remoteVideo,
                    localTrack = duo.localTrack,
                    eglContext = viewModel.eglBaseContext,
                    peerAvatarUrl = avatarUrl,
                    connected = state.showsConnectedLayout,
                    reduceMotion = reduceMotion,
                    layout = duo.layout,
                    onSwap = duo.onSwap,
                    onSceneTap = sceneTap,
                    selfCamera = selfCamera,
                    controlsVisible = chromeVisibility.isVisible(CallChromeElement.Controls) && !inPip,
                    framed = duo.framed,
                    selfUserId = viewModel.selfUserId,
                    peerUserId = config.peerId.ifBlank { viewModel.activeConfig.peerId },
                )
            }

            // L'aperçu avant décroché : la vidéo de l'appelant derrière la sonnerie, jusqu'au vrai lien.
            preview.video?.takeIf { !state.showsConnectedLayout }?.let { track ->
                CallPreviewBackdrop(track = track, eglContext = viewModel.eglBaseContext)
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
                    videoStage = duo.videoStage,
                    peer = peer,
                    pill = pill,
                    modifier = content,
                    inPip = inPip,
                    groupStage = if (groupShown) {
                        { stageModifier ->
                            CallGroupStage(
                                state = state,
                                mesh = groupMesh,
                                localTrack = duo.localTrack,
                                primaryTrack = remoteVideo,
                                eglContext = viewModel.eglBaseContext,
                                isChromeVisible = chromeVisibility.isVisible(CallChromeElement.Controls),
                                isFullScreen = chromeState.isStageFullScreen,
                                onFullScreenChange = chrome::setStageFullScreen,
                                onStageTap = sceneTap,
                                modifier = stageModifier,
                                onFocusChange = { groupFocus = it },
                            )
                        }
                    } else {
                        null
                    },
                )
                state.status == CallStatus.INCOMING -> IncomingCallScreen(
                    state = state,
                    peer = peer,
                    reduceMotion = reduceMotion,
                    onAccept = {
                        permissionGate.answerIncoming(config.isVideo) { answer -> answerIncoming(viewModel, answer) }
                    },
                    onDecline = viewModel::decline,
                    modifier = content,
                    onDeclineWithMessage = CallDeclineReplyTarget.of(config)?.let { target ->
                        { text ->
                            declineReply.send(target.peerId, target.conversationId, text)
                            viewModel.decline()
                        }
                    },
                    preview = preview,
                    onTogglePreviewSound = viewModel::togglePreviewSound,
                    // « Sans vidéo » (P17) : seul le micro est demandé, et ma caméra ne s'ouvre jamais.
                    onAcceptWithoutVideo = {
                        permissionGate.answerIncoming(isVideo = false) { answer -> answerWithoutVideo(viewModel, answer) }
                    },
                )
                state.status == CallStatus.OUTGOING_RINGING -> CallOutgoingRingingScreen(
                    state = state,
                    peer = peer,
                    reduceMotion = reduceMotion,
                    onHangUp = viewModel::hangUp,
                    previewPanel = {
                        CallPreviewOutgoingPanel(
                            preview = preview,
                            peerName = state.peerName,
                            isVideoCall = state.isVideoCall,
                            onToggleAudio = viewModel::togglePreviewAudio,
                            onToggleVideo = viewModel::togglePreviewVideo,
                            modifier = Modifier.padding(bottom = MeeshySpacing.xxl),
                        )
                    },
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

            if (state.showsConnectedLayout && !inPip) {
                CallVideoNoticePill(
                    notice = state.videoNotice,
                    modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding().padding(top = MeeshySpacing.xxl * 2),
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

            // En-tête (miroir de iOS `topChrome`) : Réduire · Image dans l'image · Conversation à gauche, capsule à
            // droite (nom · durée en vidéo, réseau dégradé seul en audio). Il s'efface avec la pilule d'un toucher sur la scène.
            var qualityDetailOpen by remember { mutableStateOf(false) }
            if (qualityDetailOpen) CallQualitySheet(onDismiss = { qualityDetailOpen = false })
            if (CallPillPresenter.isMinimizable(state.status)) {
                CallChromeFade(
                    isVisible = chromeVisibility.isVisible(CallChromeElement.Header) && !inPip,
                    onRevive = { chrome.onInteraction(CallChromeInteraction.Revive) },
                    modifier = Modifier.align(Alignment.TopStart).systemBarsPadding().padding(horizontal = MeeshySpacing.lg),
                ) {
                    CallHeaderBar(
                        state = state,
                        conversationId = headerConversationId,
                        showsMinimize = true,
                        onMinimize = onMinimize,
                        modifier = Modifier.padding(top = MeeshySpacing.xs),
                        isVideoStage = duo.videoStage,
                        onOpenQualityDetail = { qualityDetailOpen = true },
                        isGroupStage = groupShown,
                        names = headerNames,
                        participantCount = groupMesh.roster.participantCount,
                        canEnterPictureInPicture = pipViewModel.offers(state),
                        isPictureInPictureActive = inPip,
                        onEnterPictureInPicture = pipViewModel::enter,
                        onOpenConversation = onOpenConversation,
                    )
                }
            }

            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Fullscreen, overlayContext, Modifier.fillMaxSize())

            // Le mode « Capturer l'appel » : la scène qui se photographie (deux tapes) ou se filme (appui
            // long), sous le choix du cadre en direct ; le chrome de l'appel s'efface.
            if (chromeState.layer.activeMode == CallScreenMode.Montage) {
                CallMontageMode(
                    state = state,
                    localTrack = viewModel.localVideoTrack,
                    remoteTrack = remoteVideo,
                    eglContext = viewModel.eglBaseContext,
                    reduceMotion = reduceMotion,
                    onClose = chrome::exitMode,
                    pickerModifier = Modifier.align(Alignment.BottomCenter).systemBarsPadding(),
                )
            }

            // Le mode « Effets de ma caméra » : mon image en plein écran, telle qu'elle part, sous le choix d'un effet.
            if (chromeState.layer.activeMode == CallScreenMode.Effects) {
                CallEffectsMode(
                    state = state,
                    localTrack = viewModel.localVideoTrack,
                    remoteTrack = remoteVideo,
                    eglContext = viewModel.eglBaseContext,
                    reduceMotion = reduceMotion,
                    onClose = chrome::exitMode,
                )
            }

            // « Ajouter à l'appel » : une feuille, comme iOS ; la fermer rend le menu de la pilule.
            if (chromeState.layer.openPanel == CallScreenPanel.People) {
                CallAddPeopleSheet(
                    selfId = groupMesh.roster.localUserId,
                    primaryUserId = groupMesh.primaryUserId ?: config.peerId,
                    mesh = groupMesh,
                    onDismiss = chrome::backToMenu,
                )
            }

            // Le journal de la transcription : une feuille, comme iOS ; la fermer rend le menu de la pilule.
            if (chromeState.layer.openPanel == CallScreenPanel.Journal) {
                CallCaptionsJournalSheet(onDismiss = chrome::backToMenu, viewModel = captionsViewModel, captures = state.liveCaptures, peerName = state.peerName)
            }

            CallToastHost(
                toasts = extensions.toasts.toasts,
                modifier = Modifier.align(Alignment.TopCenter).systemBarsPadding(),
            )
        }
        }
    }
}

/** Ce que « Sans vidéo » devient une fois le micro tranché (refusé ⇒ raccrocher) : ma caméra ne s'ouvre jamais. */
private fun answerWithoutVideo(viewModel: CallViewModel, answer: IncomingCallAnswer) {
    if (answer == IncomingCallAnswer.HangUp) viewModel.decline() else viewModel.acceptWithoutVideo()
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
