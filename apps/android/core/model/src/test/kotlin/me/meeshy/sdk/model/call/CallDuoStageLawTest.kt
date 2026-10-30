package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallDuoStageLawTest {
    private fun layout(
        isStageShown: Boolean = true,
        isConnected: Boolean = true,
        isFramed: Boolean = false,
        isSwapped: Boolean = false,
        hasLocalTrack: Boolean = true,
        isCameraOn: Boolean = true,
        isVideoAutoPaused: Boolean = false,
    ) = CallDuoStageLaw.layout(
        CallDuoStageInputs(
            isStageShown = isStageShown,
            isConnected = isConnected,
            isFramed = isFramed,
            isSwapped = isSwapped,
            hasLocalTrack = hasLocalTrack,
            isCameraOn = isCameraOn,
            isVideoAutoPaused = isVideoAutoPaused,
        ),
    )

    @Test
    fun `connected duo, my image in the tile, its controls go around the tile`() {
        val duo = layout()
        assertThat(duo.showsSelfTile).isTrue()
        assertThat(duo.isMyImageFullScreen).isFalse()
        assertThat(duo.controlsPlacement).isEqualTo(CallCameraControlsPlacement.SelfTile)
    }

    @Test
    fun `swapped with a live camera, my image fills the screen and its controls go top center`() {
        val duo = layout(isSwapped = true)
        assertThat(duo.isMyImageFullScreen).isTrue()
        assertThat(duo.controlsPlacement).isEqualTo(CallCameraControlsPlacement.TopCenter)
    }

    @Test
    fun `swapped but camera off, my image is not full screen and the tile keeps the switch to relight it`() {
        val duo = layout(isSwapped = true, isCameraOn = false)
        assertThat(duo.isMyImageFullScreen).isFalse()
        assertThat(duo.controlsPlacement).isEqualTo(CallCameraControlsPlacement.SelfTile)
    }

    @Test
    fun `a live frame hides the tile, the menu carries my image again`() {
        assertThat(layout(isFramed = true).controlsPlacement).isEqualTo(CallCameraControlsPlacement.Menu)
        assertThat(layout(isFramed = true, isSwapped = true).controlsPlacement).isEqualTo(CallCameraControlsPlacement.Menu)
    }

    @Test
    fun `the effects mode hides the duo stage, the menu carries my image again`() {
        assertThat(layout(isStageShown = false).controlsPlacement).isEqualTo(CallCameraControlsPlacement.Menu)
    }

    @Test
    fun `before the connection there is no tile`() {
        assertThat(layout(isConnected = false).controlsPlacement).isEqualTo(CallCameraControlsPlacement.Menu)
    }

    @Test
    fun `a camera on without a local track yet shows no tile`() {
        assertThat(layout(hasLocalTrack = false).controlsPlacement).isEqualTo(CallCameraControlsPlacement.Menu)
        assertThat(layout(hasLocalTrack = false, isVideoAutoPaused = true).controlsPlacement)
            .isEqualTo(CallCameraControlsPlacement.SelfTile)
    }
}
