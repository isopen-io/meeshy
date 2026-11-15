package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallCameraRailTest {
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
    fun `rail is shown only at its placement and while the controls are visible`() {
        val visible = CallChromeVisibility()
        val hidden = CallChromeVisibility(isRevealed = false)
        val tile = CallCameraControlsPlacement.SelfTile
        assertThat(CallCameraRail.isShown(tile, tile, visible)).isTrue()
        assertThat(CallCameraRail.isShown(tile, tile, hidden)).isFalse()
        assertThat(CallCameraRail.isShown(tile, CallCameraControlsPlacement.TopCenter, visible)).isFalse()
    }
}
