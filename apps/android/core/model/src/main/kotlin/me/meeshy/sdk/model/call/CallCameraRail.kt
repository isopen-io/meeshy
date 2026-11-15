package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.camera.CameraZoomProfile

/**
 * Where the ZOOM of MY camera lives: in my tile, top-center when my image is full screen, nowhere when no tile carries it.
 * The commands of my camera (Camera, Flip, Effects, Screen) no longer have a place of their own : they are the « My image »
 * rail of the (…) on a duo, its row in the pill on a group ([CallControlsDisposition], #17327).
 */
enum class CallCameraControlsPlacement { SelfTile, TopCenter, Menu }

/**
 * The zoom of MY camera (iOS `CallZoomControl`): one chip per step when my image is full screen, a single button that
 * moves to the next step inside my tile.
 */
sealed interface CallZoomControl {
    data class LensChips(val stops: List<Float>) : CallZoomControl

    data object CycleButton : CallZoomControl
}

/** Mirrors iOS `CallCameraRail` (`CallCameraControls.swift`). */
object CallCameraRail {
    const val TARGET_SIDE_DP: Float = 44f
    const val TILE_INSET_DP: Float = 4f

    fun isMyImageFullScreen(isGroupStage: Boolean, isSelfFeatured: Boolean, isLocalPrimary: Boolean): Boolean =
        if (isGroupStage) isSelfFeatured else isLocalPrimary

    fun placement(isMyImageFullScreen: Boolean, showsMyImageTile: Boolean): CallCameraControlsPlacement = when {
        isMyImageFullScreen -> CallCameraControlsPlacement.TopCenter
        showsMyImageTile -> CallCameraControlsPlacement.SelfTile
        else -> CallCameraControlsPlacement.Menu
    }

    fun isShown(
        placement: CallCameraControlsPlacement,
        at: CallCameraControlsPlacement,
        chrome: CallChromeVisibility,
    ): Boolean = placement == at && chrome.isVisible(CallChromeElement.Controls)

    /** My tile carries no command (#17327): its top-end corner is free for the zoom button as soon as a 44 dp target fits. */
    fun zoomControl(
        profile: CameraZoomProfile?,
        placement: CallCameraControlsPlacement,
        tileWidthDp: Float?,
        tileHeightDp: Float?,
    ): CallZoomControl? {
        val stops = profile?.quickStops ?: return null
        if (stops.size <= 1) return null
        val side = TARGET_SIDE_DP + 2 * TILE_INSET_DP
        return when (placement) {
            CallCameraControlsPlacement.TopCenter -> CallZoomControl.LensChips(stops)
            CallCameraControlsPlacement.SelfTile ->
                CallZoomControl.CycleButton.takeIf { tileWidthDp != null && tileHeightDp != null && tileWidthDp >= side && tileHeightDp >= side }
            CallCameraControlsPlacement.Menu -> null
        }
    }
}
