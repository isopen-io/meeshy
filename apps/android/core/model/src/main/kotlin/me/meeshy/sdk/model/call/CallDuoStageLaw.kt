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
    /** L'autre partage son écran : il tient la une, ma permutation ne compte pas (iOS `effectiveSwapStreams`). */
    val isPeerScreenSharing: Boolean = false,
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
 * The duo counterpart of iOS `isMyImageFullScreen` + `showsMyImageTile` (`CallView+CameraRail.swift`). The layout says
 * where the ZOOM of my camera lives ([CallCameraRail.placement]); the controls of my camera are the « My image » rail of
 * the « (…) » whatever the layout (#17327).
 */
object CallDuoStageLaw {
    fun layout(inputs: CallDuoStageInputs): CallDuoStageLayout = with(inputs) {
        if (!isStageShown || !isConnected || isFramed) return CallDuoStageLayout.Hidden
        CallDuoStageLayout(
            isMyImageFullScreen = isSwapped && hasLocalTrack && isCameraOn && !isPeerScreenSharing,
            showsSelfTile = !isCameraOn || hasLocalTrack || isVideoAutoPaused,
        )
    }

    /**
     * Un toucher sur ma vignette permute-t-il les deux images ? Pas pendant un écran reçu : il garde la une, comme
     * iOS (`effectiveSwapStreams`). Le choix déjà fait n'est pas effacé, il revient avec la fin du partage.
     */
    fun acceptsSwap(isPeerScreenSharing: Boolean, hasLocalTrack: Boolean, isCameraOn: Boolean): Boolean =
        !isPeerScreenSharing && hasLocalTrack && isCameraOn
}
