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
        isPeerScreenSharing: Boolean = false,
    ) = CallDuoStageLaw.layout(
        CallDuoStageInputs(
            isStageShown = isStageShown,
            isConnected = isConnected,
            isFramed = isFramed,
            isSwapped = isSwapped,
            hasLocalTrack = hasLocalTrack,
            isCameraOn = isCameraOn,
            isVideoAutoPaused = isVideoAutoPaused,
            isPeerScreenSharing = isPeerScreenSharing,
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
    fun `a received screen keeps the stage, a swap made before the share does not put it in the tile`() {
        val duo = layout(isSwapped = true, isPeerScreenSharing = true)
        assertThat(duo.isMyImageFullScreen).isFalse()
        assertThat(duo.showsSelfTile).isTrue()
        assertThat(duo.controlsPlacement).isEqualTo(CallCameraControlsPlacement.SelfTile)
    }

    @Test
    fun `the swap choice comes back with the stage once the share ends`() {
        assertThat(layout(isSwapped = true, isPeerScreenSharing = false).isMyImageFullScreen).isTrue()
    }

    @Test
    fun `no swap is accepted while the other shares their screen, one is accepted otherwise`() {
        assertThat(CallDuoStageLaw.acceptsSwap(isPeerScreenSharing = true, hasLocalTrack = true, isCameraOn = true)).isFalse()
        assertThat(CallDuoStageLaw.acceptsSwap(isPeerScreenSharing = false, hasLocalTrack = true, isCameraOn = true)).isTrue()
        assertThat(CallDuoStageLaw.acceptsSwap(isPeerScreenSharing = false, hasLocalTrack = false, isCameraOn = true)).isFalse()
        assertThat(CallDuoStageLaw.acceptsSwap(isPeerScreenSharing = false, hasLocalTrack = true, isCameraOn = false)).isFalse()
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
