package me.meeshy.app.calls

import android.content.Context
import android.view.accessibility.AccessibilityManager
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.call.CallAudioStageLayout
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallControlsDisposition
import me.meeshy.sdk.model.call.CaptionsMode
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallHeaderLaw
import me.meeshy.sdk.model.call.CallPillText
import me.meeshy.sdk.model.call.CallRailsLayout
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.sdk.model.call.CallVerticalEdge
import me.meeshy.sdk.model.call.group.GroupCallStageLaw
import me.meeshy.ui.theme.MeeshySpacing

/** What the rails leave free at the foot of the screen: the pill and its margins in portrait, nothing when it fits between them. */
private fun callRailsBottomClearance(widthDp: Float): Dp {
    val clearance = CallRailsLayout.bottomClearance(containerWidthDp = widthDp, safeHorizontalDp = 0f)
    return if (clearance == 0f) 0.dp else MeeshySpacing.xl * 2 + clearance.dp
}

/** Is a screen reader exploring by touch? Then the chrome never hides under the finger. */
@Composable
internal fun rememberCallTouchExploration(): Boolean {
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager }
    var on by remember(manager) { mutableStateOf(manager?.isTouchExplorationEnabled == true) }
    DisposableEffect(manager) {
        val listener = AccessibilityManager.TouchExplorationStateChangeListener { on = it }
        manager?.addTouchExplorationStateChangeListener(listener)
        onDispose { manager?.removeTouchExplorationStateChangeListener(listener) }
    }
    return on
}

/** What the group stage shows of the others' cameras: the chrome hides to a tap only when one of them is on (G1.13). */
internal data class CallGroupVideoStage(val remoteCamerasOn: Int) {
    companion object {
        fun of(mesh: GroupCallMeshUi, isPrimaryVideoActive: Boolean): CallGroupVideoStage =
            CallGroupVideoStage(GroupCallStageLaw.remoteCamerasOn(mesh.roster, isPrimaryVideoActive))
    }
}

/** The video-scene rule of [CallChromeVisibility]: a duo by its video, a group ([group] non-null) by a camera, mine or theirs. */
internal fun callIsVideoStage(state: CallUiState, group: CallGroupVideoStage? = null): Boolean = CallChromeVisibility.isVideoStage(
    isGroup = group != null,
    isLocalVideoEnabled = state.isCameraOn,
    isDuoVideoActive = state.isVideoCall && state.showsConnectedLayout,
    remoteCamerasOn = group?.remoteCamerasOn ?: 0,
)

/** What the chrome shows now; reads the controller state so it recomposes on every change. */
@Composable
internal fun rememberCallChromeVisibility(
    chrome: CallChromeController,
    state: CallUiState,
    group: CallGroupVideoStage? = null,
): CallChromeVisibility {
    val explore = rememberCallTouchExploration()
    chrome.state.collectAsState().value
    return chrome.visibility(callIsVideoStage(state, group), explore)
}

/**
 * A touch on [Modifier] while [isHidden] relights the chrome ([onRevive]) WITHOUT taking the touch: the button under the
 * finger still answers, but the controls come back first (G2.7). Passive otherwise.
 */
internal fun Modifier.callReviveOnTouch(isHidden: Boolean, onRevive: () -> Unit): Modifier =
    pointerInput(isHidden) {
        if (!isHidden) return@pointerInput
        awaitPointerEventScope {
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                if (event.changes.any { it.pressed }) onRevive()
            }
        }
    }

/**
 * Stows [content] in [CallChromeStow.fadeMillis] and takes it out of the composition once stowed (it no longer captures a
 * touch nor TalkBack), leaving the room it took. Toward [stowsToward] it LEAVES BY ITS EDGE, its whole measured height
 * plus [edgeMargin] and the system bar of that edge, and comes back by the same way (G1.11, G2.8); under « Reduce
 * animations » it only fades, shortly. Only the transform and the opacity move, read at draw time. A touch received DURING the stow relights it ([onRevive]).
 */
@Composable
internal fun CallChromeFade(
    isVisible: Boolean,
    onRevive: () -> Unit,
    modifier: Modifier = Modifier,
    stowsToward: CallVerticalEdge? = null,
    edgeMargin: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    val reduceMotion = rememberCallReduceMotion()
    val fade = CallChromeStow.fadeMillis(reduceMotion)
    val fadeAlpha = animateFloatAsState(if (isVisible) 1f else 0f, tween(fade), label = "callChromeFade")
    var settledHidden by remember { mutableStateOf(!isVisible) }
    var heightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val bars = WindowInsets.systemBars
    val barPx = when (stowsToward) {
        CallVerticalEdge.Top -> bars.getTop(density)
        CallVerticalEdge.Bottom -> bars.getBottom(density)
        null -> 0
    }
    val marginPx = with(density) { edgeMargin.toPx() } + barPx
    val travelsAway = stowsToward != null && CallChromeStow.leavesByItsEdge(isVisible, reduceMotion)
    val travel = if (travelsAway && stowsToward != null) CallChromeStow.travel(stowsToward, heightPx.toFloat(), marginPx) else 0f
    val stowOffset = animateFloatAsState(travel, tween(fade), label = "callChromeStow")
    LaunchedEffect(isVisible, fade) {
        if (isVisible) {
            settledHidden = false
        } else {
            delay(fade.toLong())
            settledHidden = true
        }
    }
    if (!isVisible && settledHidden) {
        Spacer(modifier.height(with(LocalDensity.current) { heightPx.toDp() }))
        return
    }
    Box(
        modifier
            .onSizeChanged { if (it.height > 0) heightPx = it.height }
            .graphicsLayer {
                alpha = fadeAlpha.value
                translationY = stowOffset.value
            }
            .callReviveOnTouch(isHidden = !isVisible, onRevive = onRevive),
    ) { content() }
}

/**
 * The connected layout (also kept during a reconnection with media established): the peer, the
 * captions, the capability slots and the pill. A tap on the video scene hides the header, the pill
 * and the panels in a fade; a tap lights them again; nothing hides in audio or under TalkBack.
 */
@Composable
internal fun CallConnectedColumn(
    state: CallUiState,
    accent: Color,
    viewModel: CallViewModel,
    overlayContext: CallOverlayContext,
    chrome: CallChromeController,
    videoStage: Boolean,
    peer: CallPeerVisual,
    pill: CallPillActions,
    modifier: Modifier = Modifier,
    inPip: Boolean = false,
    /** What the group stage shows of the others' cameras (G1.13); `null` on a duo. */
    groupVideo: CallGroupVideoStage? = null,
    /** La scène d'un appel de groupe (#13740), posée à la place du bloc du pair ; `null` en duo. */
    groupStage: (@Composable (Modifier) -> Unit)? = null,
    /** La parole du pair, pour l'anneau de la scène audio. */
    peerSpeech: CallPeerSpeechSource = CallPeerSpeechSource.NONE,
) {
    val extensions = viewModel.extensions
    val explore = rememberCallTouchExploration()
    val chromeState by chrome.state.collectAsState()
    val visibility = chrome.visibility(callIsVideoStage(state, groupVideo), explore)
    val controlsVisible = visibility.isVisible(CallChromeElement.Controls) && !inPip

    val recordingViewModel: CallRecordingViewModel = hiltViewModel()
    val reactionsViewModel: CallReactionsViewModel = hiltViewModel()
    val available = pill.available
    LaunchedEffect(available) { chrome.reconcile(available) }

    val routeViewModel: CallAudioRouteViewModel = hiltViewModel()
    val route by routeViewModel.state.collectAsStateWithLifecycle()
    var routeSheetOpen by remember { mutableStateOf(false) }
    val signalingDegraded by viewModel.signalingDegraded.collectAsStateWithLifecycle()
    LaunchedEffect(state.isVideoCall) { routeViewModel.onEvent(CallAudioRouteUiEvent.Start(state.isVideoCall)) }

    BoxWithConstraints(modifier) {
        val pillText = CallPillText.resolve(
            isCaptionsEnabled = state.captions.mode != CaptionsMode.Off,
            layer = chromeState.layer,
            isChromeRevealed = controlsVisible,
        )
        // #17327 : à deux le (…) fait sortir deux rails sur les bords, à plusieurs il déplie des rangées dans la pilule.
        val disposition = CallControlsDisposition.resolve(CallControlsDisposition.MAX_PARTICIPANTS_ON_RAILS, showsGroupGrid = groupStage != null)
        val rows = CallGroupStageSizing.rows(disposition.pillRows(available, chromeState.layer), CallGroupStageSizing.isCompactHeight(maxHeight.value))
        Column(
            modifier = Modifier.matchParentSize().padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.height(MeeshySpacing.xl))

            if (groupStage != null) {
                groupStage(Modifier.weight(1f).fillMaxWidth().padding(vertical = MeeshySpacing.md))
            } else if (!CallHeaderLaw.centersPeerBlock(videoStage)) {
                // L'image est le pair : ni nom, ni chrono, ni barres au centre. Le temps et le signal
                // vivent dans la puce de l'en-tête (CallHeaderBar) ; la capture, dans la capsule ci-dessous.
                Spacer(Modifier.weight(1f).fillMaxWidth())
            } else {
                // #17529 : le journal ouvert dans la pilule resserre l'avatar en en-tête compact (P9b).
                CallAudioStageSwitch(
                    compact = CallAudioStageLayout.compacts(pillText, isVideoStage = videoStage),
                    state = state,
                    peer = peer,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    signalingDegraded = signalingDegraded,
                    peerSpeech = peerSpeech,
                )
            }

            state.captionText?.let { caption -> CallCaption(caption) }
            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.AboveControls, overlayContext)

            // La vignette à la une en plein écran (#13750) rend toute la place : la pilule sort de la mise en page.
            if (!chromeState.isStageFullScreen) CallControlsBlock(
                pillText = pillText,
                controlsVisible = controlsVisible,
                onRevive = { chrome.onInteraction(CallChromeInteraction.Revive) },
                onInteraction = chrome::onInteraction,
                modifier = Modifier.padding(bottom = MeeshySpacing.xl),
            ) {
                CallControlsPill(
                    state = state,
                    layer = chromeState.layer,
                    disposition = disposition,
                    rows = rows,
                    items = pill.items,
                    outputIcon = route.route.active?.kind?.icon() ?: Icons.Filled.VolumeUp,
                    onToggleMenu = chrome::toggleMenu,
                    onToggleMute = viewModel::toggleMute,
                    onOutput = { routeSheetOpen = true },
                    onHangUp = viewModel::hangUp,
                    onAction = pill.onAction,
                    onBackToMenu = chrome::backToMenu,
                    onClosePanel = chrome::close,
                    pillText = pillText,
                    captions = { CallCaptionsBandHost(state = state, hasOwnGlass = false) },
                    panelContent = { panel ->
                        when (panel) {
                            CallScreenPanel.Record -> CallRecordingKindPanel(
                                onPick = { kind ->
                                    recordingViewModel.onEvent(CallRecordingUiEvent.Pick(kind))
                                    chrome.close()
                                },
                            )
                            CallScreenPanel.React -> CallReactionsPanel(onReact = reactionsViewModel::react)
                            CallScreenPanel.Journal -> CallJournalPanel(onClose = chrome::close, captures = state.liveCaptures, peerName = state.peerName)
                            else -> Unit
                        }
                    },
                )
            }
        }
        androidx.compose.runtime.CompositionLocalProvider(LocalCallChromeInteraction provides chrome::onInteraction) {
            CallActionRails(
                rows = if (controlsVisible) disposition.railRows(available, chromeState.layer) else emptyList(),
                items = pill.items,
                dimmed = if (state.isOnHold) HOLD_DIMMED_ACTIONS else emptySet(),
                onAction = pill.onAction,
                bottomClearance = callRailsBottomClearance(maxWidth.value),
                onRevive = { chrome.onInteraction(CallChromeInteraction.Revive) },
            )
        }
        // #16665 — R1 : la capsule de capture, UNE fois sous l'en-tête, en audio comme en vidéo, en duo
        // comme en groupe ; hors du fondu du chrome : une capture ne se cache pas.
        if (state.isPeerScreenCapturing && !inPip) {
            CallCaptureCapsule(
                name = state.peerScreenCapturerName.ifBlank { state.peerName },
                modifier = Modifier.align(Alignment.TopCenter).padding(top = CALL_CAPTURE_CAPSULE_TOP, start = MeeshySpacing.lg, end = MeeshySpacing.lg),
            )
        }
    }

    val pickerBridge: CallCameraPickerViewModel = hiltViewModel()
    val pickerOpen by pickerBridge.controller.isOpen.collectAsStateWithLifecycle()
    if (pickerOpen) {
        val camera by viewModel.cameraZoom.state.collectAsStateWithLifecycle()
        CallCameraPickerSheet(
            cameras = camera.cameras,
            selectedId = camera.selectedCameraId,
            accent = accent,
            onSelect = viewModel::selectCamera,
            onDismiss = pickerBridge.controller::close,
        )
    }

    if (routeSheetOpen) {
        CallAudioRouteSheet(
            state = route.route,
            accent = accent,
            onSelect = { routeViewModel.onEvent(CallAudioRouteUiEvent.Select(it)) },
            onBluetoothPermission = { routeViewModel.onEvent(CallAudioRouteUiEvent.BluetoothPermissionResult(it)) },
            onDismiss = { routeSheetOpen = false },
        )
    }
}
