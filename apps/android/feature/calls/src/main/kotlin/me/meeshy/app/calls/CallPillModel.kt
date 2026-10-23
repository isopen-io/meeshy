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
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallPillRowContent

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
    fun actionContext(state: CallUiState, isRegistered: (CallAction) -> Boolean): CallActionContext =
        CallActionContext(
            isDesktop = false,
            isVideoEnabled = state.isVideoCall && state.isCameraOn,
            hasSelectableCameras = false,
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

    /** What the capabilities offer, plus the built-in camera toggle, keyed by action. */
    fun items(state: CallUiState, offered: List<OfferedCallAction>): Map<CallAction, CallPillItem> {
        val fromHandlers = offered.associate { entry ->
            entry.action to CallPillItem(
                action = entry.action,
                icon = entry.presentation.icon,
                labelRes = entry.presentation.labelRes,
                kind = if (entry.presentation.isActive) CallPillKind.Active else CallPillKind.Normal,
                isToggle = entry.presentation.isActive,
            )
        }
        val camera = cameraItem(state)?.let { mapOf(CallAction.Camera to it) }.orEmpty()
        return fromHandlers + camera
    }

    /** The law's actions that this call can actually offer right now (a handler, or the built-in camera). */
    fun available(
        state: CallUiState,
        items: Map<CallAction, CallPillItem>,
        isRegistered: (CallAction) -> Boolean,
    ): CallActionSet {
        val set = CallActionSet.resolve(actionContext(state, isRegistered))
        return CallActionSet(
            myImage = set.myImage.filter { it in items },
            theCall = set.theCall.filter { it in items },
        )
    }

    /** The rows to draw: one per family (titled), or ONE untitled line in compact height. */
    fun rows(available: CallActionSet, isCompactHeight: Boolean): List<CallPillRowContent> =
        CallGroupStageSizing.rows(available.familyRows, isCompactHeight)
}
