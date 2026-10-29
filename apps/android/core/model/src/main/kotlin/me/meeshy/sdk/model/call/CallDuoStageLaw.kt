package me.meeshy.sdk.model.call

/** What the duo stage is drawing right now, read by the screen once per render. */
data class CallDuoStageInputs(
    /** The duo stage is composed (a video call, outside the « Effects » mode that draws both videos itself). */
    val isStageShown: Boolean,
    val isConnected: Boolean,
    /** A live call frame is shown: it hides my tile (#13696). */
    val isFramed: Boolean,
    /** The user tapped my tile to swap the two videos. */
    val isSwapped: Boolean,
    val hasLocalTrack: Boolean,
    val isCameraOn: Boolean,
    val isVideoAutoPaused: Boolean,
)

/** Where MY image sits on the duo stage, hence where the controls of my camera live. */
data class CallDuoStageLayout(val isMyImageFullScreen: Boolean, val showsSelfTile: Boolean) {
    val controlsPlacement: CallCameraControlsPlacement
        get() = CallCameraRail.placement(isMyImageFullScreen = isMyImageFullScreen, showsMyImageTile = showsSelfTile)

    companion object {
        val Hidden = CallDuoStageLayout(isMyImageFullScreen = false, showsSelfTile = false)
    }
}

/**
 * The duo counterpart of iOS `isMyImageFullScreen` + `showsMyImageTile` (`CallView+CameraRail.swift`). The stage
 * and the pill read the SAME layout: the tile and the top rail carry my camera's controls, so the « (…) » drops
 * them ([CallCameraRail.menuRows]) — never two buttons for the same action.
 */
object CallDuoStageLaw {
    fun layout(inputs: CallDuoStageInputs): CallDuoStageLayout = with(inputs) {
        if (!isStageShown || !isConnected || isFramed) return CallDuoStageLayout.Hidden
        CallDuoStageLayout(
            isMyImageFullScreen = isSwapped && hasLocalTrack && isCameraOn,
            showsSelfTile = !isCameraOn || hasLocalTrack || isVideoAutoPaused,
        )
    }
}
