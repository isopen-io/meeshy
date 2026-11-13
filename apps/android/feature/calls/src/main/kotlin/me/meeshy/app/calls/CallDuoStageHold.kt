package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.call.CallDuoStageInputs
import me.meeshy.sdk.model.call.CallDuoStageLaw
import me.meeshy.sdk.model.call.CallDuoStageLayout
import me.meeshy.sdk.model.call.CallScreenMode
import me.meeshy.sdk.model.call.group.GroupCallStageFocus
import org.webrtc.VideoTrack

/** Ce que la scène du duo dessine ce rendu-ci, lu une fois par l'écran : la scène, la pilule et le verre lisent le même. */
internal class CallDuoStageHold(
    /** Un appel vidéo, ou un pair qui escalade l'audio en vidéo. */
    val videoStage: Boolean,
    val shown: Boolean,
    val framed: Boolean,
    val callKey: String,
    val localTrack: VideoTrack?,
    val layout: CallDuoStageLayout,
    val onSwap: () -> Unit,
)

/**
 * La scène du duo (iOS `isMyImageFullScreen` + `showsMyImageTile`). La permutation vit ICI, pas dans la scène : la
 * disposition dit où vit le zoom de ma caméra (iOS `CallCameraRail.placement`), et le
 * verre adaptatif sait si MON image tient la scène (loi 3). Le cadre en direct est un habit du DUO : il tombe dès que
 * l'appel passe à trois (loi 16). Un écran reçu garde la une : la permutation est refusée tant qu'il dure, et celle
 * déjà faite revient avec la fin du partage (iOS `effectiveSwapStreams`).
 */
@Composable
internal fun rememberCallDuoStage(
    state: CallUiState,
    viewModel: CallViewModel,
    config: CallConfig,
    activeMode: CallScreenMode?,
    groupShown: Boolean,
    hasRemoteVideo: Boolean,
    reduceMotion: Boolean,
): CallDuoStageHold {
    val videoStage = state.isVideoCall || hasRemoteVideo
    val liveFrame: CallLiveFrameViewModel = hiltViewModel()
    val liveFrameState by liveFrame.controller.state.collectAsStateWithLifecycle()
    LaunchedEffect(groupShown) { if (groupShown) liveFrame.controller.leaveDuo() }
    val framed = CallLiveFrameStage.framesTheDuo(
        frameId = liveFrameState.frameId,
        isVideoCall = state.isVideoCall,
        showsConnectedLayout = state.showsConnectedLayout,
        constrained = rememberCallDeviceConstrained(),
        reduceMotion = reduceMotion,
    )
    // Le mode « Effets » pose lui-même les deux vidéos (la mienne en plein écran, l'autre en vignette) : la
    // scène du duo s'efface, sa vignette de soi en `SurfaceView` superposée percerait le mode.
    // Un appel de groupe à deux membres distants ou plus pose sa grille entre l'en-tête et la pilule (#13740) :
    // la scène du duo s'efface, la vidéo du principal passe dans sa vignette.
    val shown = videoStage && activeMode != CallScreenMode.Effects && !groupShown
    val callKey = viewModel.activeCallId.ifBlank { config.callId }.ifBlank { config.peerId }
    var swapped by remember(callKey) { mutableStateOf(false) }
    val localTrack = viewModel.localVideoTrack
    val layout = CallDuoStageLaw.layout(
        CallDuoStageInputs(
            isStageShown = shown,
            isConnected = state.showsConnectedLayout,
            isFramed = framed,
            isSwapped = swapped,
            hasLocalTrack = localTrack != null,
            isCameraOn = state.isCameraOn,
            isVideoAutoPaused = state.isVideoAutoPaused,
            isPeerScreenSharing = state.isPeerScreenSharing,
        ),
    )
    return CallDuoStageHold(
        videoStage = videoStage,
        shown = shown,
        framed = framed,
        callKey = callKey,
        localTrack = localTrack,
        layout = layout,
        onSwap = {
            if (CallDuoStageLaw.acceptsSwap(state.isPeerScreenSharing, hasLocalTrack = localTrack != null, isCameraOn = state.isCameraOn)) swapped = !swapped
        },
    )
}

/**
 * Le ton du verre de l'écran (loi 3) : sombre quand un écran REÇU tient la scène. Mon image en plein écran — permutée
 * dans le duo, ou dans le mode « Effets » — garde le verre clair.
 */
internal fun callGlassTone(
    groupShown: Boolean,
    isPeerScreenSharing: Boolean,
    duo: CallDuoStageHold,
    activeMode: CallScreenMode?,
    groupFocus: GroupCallStageFocus,
): CallGlassTone = CallGlassTone.of(
    CallGlassTone.showsReceivedScreen(
        isGroupStage = groupShown,
        duoPeerSharing = isPeerScreenSharing,
        duoMyImageFullScreen = duo.layout.isMyImageFullScreen || activeMode == CallScreenMode.Effects,
        groupFocus = groupFocus,
    ),
)
