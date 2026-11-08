package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.camera.CameraFacing
import org.junit.Test

class CallCameraMirrorTest {
    @Test
    fun `only the front camera preview is mirrored`() {
        val table = CameraFacing.values().flatMap { facing -> CallVideoRole.values().map { facing to it } }
        val mirrored = table.filter { (facing, role) -> CallCameraMirror.isMirrored(facing, role) }
        assertThat(mirrored).containsExactly(CameraFacing.Front to CallVideoRole.LocalPreview)
    }

    @Test
    fun `the sent stream and the capture are never mirrored whatever the camera`() {
        CameraFacing.values().forEach { facing ->
            assertThat(CallCameraMirror.isMirrored(facing, CallVideoRole.Sent)).isFalse()
            assertThat(CallCameraMirror.isMirrored(facing, CallVideoRole.Capture)).isFalse()
        }
    }

    @Test
    fun `the displayed facing follows the confirmed camera over the intention`() {
        assertThat(CallCameraMirror.displayedFacing(live = CameraFacing.Back, intendedFront = true)).isEqualTo(CameraFacing.Back)
        assertThat(CallCameraMirror.displayedFacing(live = CameraFacing.External, intendedFront = true)).isEqualTo(CameraFacing.External)
    }

    @Test
    fun `without a confirmed camera the displayed facing follows the intention`() {
        assertThat(CallCameraMirror.displayedFacing(live = null, intendedFront = true)).isEqualTo(CameraFacing.Front)
        assertThat(CallCameraMirror.displayedFacing(live = null, intendedFront = false)).isEqualTo(CameraFacing.Back)
    }
}
