package me.meeshy.sdk.model.call

/** Where the controls of MY camera live: around my tile, top-center when my image is full screen, else in the menu. */
enum class CallCameraControlsPlacement { SelfTile, TopCenter, Menu }

/** The two rows outside my tile: what travels with my image above, what acts on the camera below. */
data class CallSelfTileControlRows(val effects: List<CallAction>, val camera: List<CallAction>) {
    val isEmpty: Boolean get() = effects.isEmpty() && camera.isEmpty()
}

enum class CallCameraFoldedTap { Button, Action, Elsewhere }

/** Mirrors iOS `CallCameraRail` (`CallCameraControls.swift`). */
object CallCameraRail {
    const val TARGET_SIDE_DP: Float = 44f
    val order: List<CallAction> = listOf(
        CallAction.FlipCamera, CallAction.CameraPicker, CallAction.Camera, CallAction.Effects, CallAction.ScreenShare,
    )
    val effectsRow: List<CallAction> = listOf(CallAction.Effects, CallAction.ScreenShare)
    val cameraRow: List<CallAction> = listOf(CallAction.FlipCamera, CallAction.CameraPicker, CallAction.Camera)

    fun actions(set: CallActionSet): List<CallAction> = order.filter { it in set.myImage }

    fun isMyImageFullScreen(isGroupStage: Boolean, isSelfFeatured: Boolean, isLocalPrimary: Boolean): Boolean =
        if (isGroupStage) isSelfFeatured else isLocalPrimary

    fun placement(isMyImageFullScreen: Boolean, showsMyImageTile: Boolean): CallCameraControlsPlacement = when {
        isMyImageFullScreen -> CallCameraControlsPlacement.TopCenter
        showsMyImageTile -> CallCameraControlsPlacement.SelfTile
        else -> CallCameraControlsPlacement.Menu
    }

    fun foldedMenu(isOpen: Boolean, after: CallCameraFoldedTap): Boolean =
        if (after == CallCameraFoldedTap.Button) !isOpen else false

    fun consumesTapElsewhere(isFoldedMenuOpen: Boolean): Boolean = isFoldedMenuOpen

    fun isShown(
        placement: CallCameraControlsPlacement,
        at: CallCameraControlsPlacement,
        chrome: CallChromeVisibility,
    ): Boolean = placement == at && chrome.isVisible(CallChromeElement.Controls)

    fun selfTileRows(actions: List<CallAction>): CallSelfTileControlRows = CallSelfTileControlRows(
        effects = effectsRow.filter { it in actions },
        camera = cameraRow.filter { it in actions },
    )

    fun menuRows(set: CallActionSet, placement: CallCameraControlsPlacement): List<CallActionFamilyRow> =
        if (placement == CallCameraControlsPlacement.Menu) set.familyRows
        else set.familyRows.filter { it.family != CallActionFamily.MyImage }
}
