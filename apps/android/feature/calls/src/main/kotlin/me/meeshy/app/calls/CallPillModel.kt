package me.meeshy.app.calls

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionContext
import me.meeshy.sdk.model.call.CallActionSet
import me.meeshy.sdk.model.call.CallCameraControlsPlacement
import me.meeshy.sdk.model.call.CallCameraRail
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallPillRowContent
import me.meeshy.ui.icons.MeeshyIcons

/** One drawable action of the unfolded rows. [captionRes] defaults to the label when `null`. */
internal data class CallPillItem(
    val action: CallAction,
    val icon: ImageVector,
    @StringRes val labelRes: Int,
    val kind: CallPillKind,
    @StringRes val captionRes: Int? = null,
    @StringRes val hintRes: Int? = null,
    val isToggle: Boolean = false,
)

/**
 * What the unfolded rows hold. The laws (which actions, in which order, when) are the shared
 * [CallActionSet] / [CallGroupStageSizing]; this only intersects them with what the call can
 * actually do right now: an action with no handler registered is absent, never greyed.
 */
internal object CallPillModel {

    /** The context of the action law, read from the call snapshot. */
    fun actionContext(
        state: CallUiState,
        isRegistered: (CallAction) -> Boolean,
        hasSelectableCameras: Boolean = false,
    ): CallActionContext =
        CallActionContext(
            isDesktop = false,
            isVideoEnabled = state.isVideoCall && state.isCameraOn,
            hasSelectableCameras = hasSelectableCameras,
            isConnected = state.status == CallStatus.CONNECTED,
            mayRecord = isRegistered(CallAction.Recording),
            canPictureInPicture = isRegistered(CallAction.PictureInPicture),
            showsVideo = state.isVideoCall && state.showsConnectedLayout,
        )

    /** The camera toggle: always there on a video call, amber while the app froze the video. */
    fun cameraItem(state: CallUiState): CallPillItem? {
        if (!state.isVideoCall) return null
        val paused = state.isVideoAutoPaused
        return CallPillItem(
            action = CallAction.Camera,
            icon = if (state.isCameraOn) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
            labelRes = if (paused) R.string.call_control_video_paused else R.string.call_action_camera,
            kind = when {
                paused -> CallPillKind.Warning
                state.isCameraOn -> CallPillKind.Active
                else -> CallPillKind.Normal
            },
            captionRes = if (paused) R.string.call_control_video_paused_caption else R.string.call_control_video_caption,
            hintRes = if (paused) R.string.call_control_video_paused_hint else null,
            isToggle = true,
        )
    }

    /** « Basculer la caméra » : offerte tant que la caméra émet (iOS `.flipCamera`). */
    fun flipItem(state: CallUiState): CallPillItem? {
        if (!state.isVideoCall || !state.isCameraOn) return null
        return CallPillItem(
            action = CallAction.FlipCamera,
            icon = MeeshyIcons.FlipCamera,
            labelRes = R.string.call_control_flip_camera,
            kind = CallPillKind.Normal,
            captionRes = R.string.call_control_flip_camera_caption,
            hintRes = R.string.call_control_flip_camera_hint,
        )
    }

    /** What the capabilities offer, plus the built-in camera toggle, keyed by action. */
    fun items(state: CallUiState, offered: List<OfferedCallAction>): Map<CallAction, CallPillItem> {
        val fromHandlers = offered.associate { entry ->
            entry.action to CallPillItem(
                action = entry.action,
                icon = entry.presentation.icon,
                labelRes = entry.presentation.labelRes,
                kind = if (entry.presentation.isActive) CallPillKind.Active else CallPillKind.Normal,
                captionRes = entry.presentation.captionRes,
                hintRes = entry.presentation.hintRes,
                isToggle = entry.presentation.isActive,
            )
        }
        val camera = cameraItem(state)?.let { mapOf(CallAction.Camera to it) }.orEmpty()
        val flip = flipItem(state)?.let { mapOf(CallAction.FlipCamera to it) }.orEmpty()
        return fromHandlers + camera + flip
    }

    /** The law's actions that this call can actually offer right now (a handler, or the built-in camera). */
    fun available(
        state: CallUiState,
        items: Map<CallAction, CallPillItem>,
        isRegistered: (CallAction) -> Boolean,
    ): CallActionSet {
        // « Choisir la caméra » n'est présenté que lorsqu'une caméra est branchée : il remplace alors la bascule.
        val set = CallActionSet.resolve(actionContext(state, isRegistered, hasSelectableCameras = CallAction.CameraPicker in items))
        return CallActionSet(
            myImage = set.myImage.filter { it in items },
            theCall = set.theCall.filter { it in items },
        )
    }

    /**
     * The rows to draw: one per family (titled), or ONE untitled line in compact height. When my tile or the top
     * rail carries the controls of my image ([placement]), the « (…) » drops them (iOS `CallCameraRail.menuRows`).
     */
    fun rows(
        available: CallActionSet,
        isCompactHeight: Boolean,
        placement: CallCameraControlsPlacement,
    ): List<CallPillRowContent> =
        CallGroupStageSizing.rows(CallCameraRail.menuRows(available, placement), isCompactHeight)

    /** « Effets · Écran », the row above my tile (iOS `CallCameraRail.selfTileRows`): only what the call offers now. */
    fun selfEffects(available: CallActionSet, items: Map<CallAction, CallPillItem>): List<CallPillItem> =
        CallCameraRail.selfTileRows(CallCameraRail.actions(available)).effects.mapNotNull(items::get)
}
