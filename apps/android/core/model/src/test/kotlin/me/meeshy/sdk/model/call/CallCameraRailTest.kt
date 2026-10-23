package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallCameraRailTest {
    private val set = CallActionSet(
        myImage = listOf(CallAction.Camera, CallAction.FlipCamera, CallAction.Effects, CallAction.ScreenShare),
        theCall = listOf(CallAction.Captions),
    )

    @Test
    fun `placement is top center when my image is full screen`() {
        assertThat(CallCameraRail.placement(isMyImageFullScreen = true, showsMyImageTile = true))
            .isEqualTo(CallCameraControlsPlacement.TopCenter)
    }

    @Test
    fun `placement is around my tile when it is shown`() {
        assertThat(CallCameraRail.placement(isMyImageFullScreen = false, showsMyImageTile = true))
            .isEqualTo(CallCameraControlsPlacement.SelfTile)
    }

    @Test
    fun `placement falls back to the menu when no tile carries my image`() {
        assertThat(CallCameraRail.placement(isMyImageFullScreen = false, showsMyImageTile = false))
            .isEqualTo(CallCameraControlsPlacement.Menu)
    }

    @Test
    fun `full screen follows the featured self on a group and the primary local on a duo`() {
        assertThat(CallCameraRail.isMyImageFullScreen(true, isSelfFeatured = true, isLocalPrimary = false)).isTrue()
        assertThat(CallCameraRail.isMyImageFullScreen(false, isSelfFeatured = true, isLocalPrimary = false)).isFalse()
        assertThat(CallCameraRail.isMyImageFullScreen(false, isSelfFeatured = false, isLocalPrimary = true)).isTrue()
    }

    @Test
    fun `rail actions follow the canonical order`() {
        assertThat(CallCameraRail.actions(set)).containsExactly(
            CallAction.FlipCamera, CallAction.Camera, CallAction.Effects, CallAction.ScreenShare,
        ).inOrder()
    }

    @Test
    fun `self tile rows split effects above and camera below`() {
        val rows = CallCameraRail.selfTileRows(CallCameraRail.actions(set))
        assertThat(rows.effects).containsExactly(CallAction.Effects, CallAction.ScreenShare).inOrder()
        assertThat(rows.camera).containsExactly(CallAction.FlipCamera, CallAction.Camera).inOrder()
        assertThat(CallCameraRail.selfTileRows(emptyList()).isEmpty).isTrue()
    }

    @Test
    fun `menu keeps my image only when the menu is the placement`() {
        assertThat(CallCameraRail.menuRows(set, CallCameraControlsPlacement.Menu).map { it.family })
            .containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
        assertThat(CallCameraRail.menuRows(set, CallCameraControlsPlacement.SelfTile).map { it.family })
            .containsExactly(CallActionFamily.TheCall)
    }

    @Test
    fun `folded menu toggles on its button and closes on anything else`() {
        assertThat(CallCameraRail.foldedMenu(false, CallCameraFoldedTap.Button)).isTrue()
        assertThat(CallCameraRail.foldedMenu(true, CallCameraFoldedTap.Button)).isFalse()
        assertThat(CallCameraRail.foldedMenu(true, CallCameraFoldedTap.Action)).isFalse()
        assertThat(CallCameraRail.foldedMenu(true, CallCameraFoldedTap.Elsewhere)).isFalse()
        assertThat(CallCameraRail.consumesTapElsewhere(true)).isTrue()
    }

    @Test
    fun `rail is shown only at its placement and while the controls are visible`() {
        val visible = CallChromeVisibility()
        val hidden = CallChromeVisibility(isRevealed = false)
        val tile = CallCameraControlsPlacement.SelfTile
        assertThat(CallCameraRail.isShown(tile, tile, visible)).isTrue()
        assertThat(CallCameraRail.isShown(tile, tile, hidden)).isFalse()
        assertThat(CallCameraRail.isShown(tile, CallCameraControlsPlacement.TopCenter, visible)).isFalse()
    }
}
