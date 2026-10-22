package me.meeshy.app.calls

import android.content.Context
import android.view.accessibility.AccessibilityManager
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.sdk.model.call.CallChromeVisibility
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.CallScreenPanel
import me.meeshy.ui.theme.MeeshySpacing

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

internal fun callIsVideoStage(state: CallUiState): Boolean = CallChromeVisibility.isVideoStage(
    isGroup = false,
    isLocalVideoEnabled = state.isCameraOn,
    isDuoVideoActive = state.isVideoCall && state.showsConnectedLayout,
    remoteCamerasOn = 0,
)

/** What the chrome shows now; reads the controller state so it recomposes on every change. */
@Composable
internal fun rememberCallChromeVisibility(chrome: CallChromeController, state: CallUiState): CallChromeVisibility {
    val explore = rememberCallTouchExploration()
    chrome.state.collectAsState().value
    return chrome.visibility(callIsVideoStage(state), explore)
}

/**
 * Fades [content] out in [CallChromeVisibility.FADE_DURATION_MILLIS] and takes it out of the
 * composition once faded (it no longer captures a touch nor TalkBack), leaving the room it took.
 * A touch received DURING the fade relights it ([onRevive]).
 */
@Composable
internal fun CallChromeFade(
    isVisible: Boolean,
    onRevive: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val fade = CallChromeVisibility.FADE_DURATION_MILLIS.toInt()
    val alpha by animateFloatAsState(if (isVisible) 1f else 0f, tween(fade), label = "callChromeFade")
    var settledHidden by remember { mutableStateOf(!isVisible) }
    var heightPx by remember { mutableIntStateOf(0) }
    LaunchedEffect(isVisible) {
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
            .alpha(alpha)
            .pointerInput(isVisible) {
                if (isVisible) return@pointerInput
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.any { it.pressed }) onRevive()
                    }
                }
            },
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
    modifier: Modifier = Modifier,
) {
    val extensions = viewModel.extensions
    val dispatcher = extensions.actions
    val explore = rememberCallTouchExploration()
    val chromeState by chrome.state.collectAsState()
    val visibility = chrome.visibility(callIsVideoStage(state), explore)
    val controlsVisible = visibility.isVisible(CallChromeElement.Controls)
    val isVideoStage = callIsVideoStage(state)

    val offered = remember(state) { dispatcher.offered(state) }
    val items = remember(state, offered) { CallPillModel.items(state, offered) }
    val available = remember(state, items) { CallPillModel.available(state, items, dispatcher::isRegistered) }
    LaunchedEffect(available) { chrome.reconcile(available) }

    val routeViewModel: CallAudioRouteViewModel = hiltViewModel()
    val route by routeViewModel.state.collectAsStateWithLifecycle()
    var routeSheetOpen by remember { mutableStateOf(false) }
    LaunchedEffect(state.isVideoCall) { routeViewModel.onEvent(CallAudioRouteUiEvent.Start(state.isVideoCall)) }

    val onAction: (CallAction) -> Unit = { action ->
        CallScreenPanel.entries.firstOrNull { it.action == action }?.let(chrome::open)
        CallScreenMode.entries.firstOrNull { it.action == action }?.let(chrome::enter)
        if (action == CallAction.Camera) viewModel.toggleCamera() else dispatcher.dispatch(action)
    }

    BoxWithConstraints(
        modifier.pointerInput(isVideoStage, explore) {
            if (CallChromeVisibility.mayToggleByTap(isVideoStage, explore)) {
                detectTapGestures(onTap = { chrome.onSceneTap(isVideoStage, explore) })
            }
        },
    ) {
        val rows = CallPillModel.rows(available, CallGroupStageSizing.isCompactHeight(maxHeight.value))
        Column(
            modifier = Modifier.matchParentSize().padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Spacer(Modifier.height(MeeshySpacing.xl))

            CallPeerBlock(state = state, accent = accent)

            state.captionText?.let { caption -> CallCaption(caption) }
            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.Captions, overlayContext)
            CallOverlaySlotHost(extensions.overlays, CallOverlaySlot.AboveControls, overlayContext)

            CallChromeFade(
                isVisible = controlsVisible,
                onRevive = { chrome.onInteraction(CallChromeInteraction.Revive) },
                modifier = Modifier.padding(bottom = MeeshySpacing.xl),
            ) {
                androidx.compose.runtime.CompositionLocalProvider(
                    LocalCallChromeInteraction provides chrome::onInteraction,
                ) {
                    CallControlsPill(
                        state = state,
                        layer = chromeState.layer,
                        rows = rows,
                        items = items,
                        outputIcon = route.route.active?.kind?.icon() ?: Icons.Filled.VolumeUp,
                        onToggleMenu = chrome::toggleMenu,
                        onToggleMute = viewModel::toggleMute,
                        onOutput = { routeSheetOpen = true },
                        onHangUp = viewModel::hangUp,
                        onAction = onAction,
                        onBackToMenu = chrome::backToMenu,
                        onClosePanel = chrome::close,
                    )
                }
            }
        }
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
