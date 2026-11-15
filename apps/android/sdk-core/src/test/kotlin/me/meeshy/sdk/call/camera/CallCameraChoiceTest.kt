package me.meeshy.sdk.call.camera

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.camera.CameraDeviceOption
import me.meeshy.sdk.model.call.camera.CameraFacing
import me.meeshy.sdk.model.call.camera.CameraLens
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import org.junit.Test

class CallCameraChoiceTest {
    private val cameras = listOf(
        CameraDeviceOption("1", CameraFacing.Front),
        CameraDeviceOption("0", CameraFacing.Back),
        CameraDeviceOption("10", CameraFacing.External),
    )

    private class Actuator(private val opens: Boolean = true) : CameraZoomActuator {
        lateinit var zoom: CallCameraZoom
        val cameraOpened = mutableListOf<String>()
        override fun setCrop(zoom: Float, rampRate: Float?) = Unit
        override fun openLens(lensId: String) = Unit
        override fun openCamera(cameraId: String): Boolean {
            cameraOpened += cameraId
            if (opens) zoom.attach(null, cameraId, cameras = zoom.state.value.cameras, selectedCameraId = cameraId, facing = CameraFacing.External)
            return opens
        }
    }

    private fun attached(actuator: Actuator): CallCameraZoom {
        val zoom = CallCameraZoom(actuator)
        actuator.zoom = zoom
        val back = CameraZoomPolicy.profile(listOf(CameraLens("0", 1f)), isFront = false, maxDigitalZoom = 8f)
        zoom.attach(back, "0", cameras = cameras, selectedCameraId = "0", facing = CameraFacing.Back)
        return zoom
    }

    @Test
    fun `la camera ouverte et ses voisines sont lues dans l'etat de ma camera`() {
        val zoom = attached(Actuator())
        assertThat(zoom.state.value.cameras).isEqualTo(cameras)
        assertThat(zoom.state.value.selectedCameraId).isEqualTo("0")
        assertThat(zoom.state.value.facing).isEqualTo(CameraFacing.Back)
    }

    @Test
    fun `choisir une camera la rouvre sur la meme source et repart a son zoom`() {
        val actuator = Actuator()
        val zoom = attached(actuator)
        assertThat(zoom.selectCamera("10")).isTrue()
        assertThat(actuator.cameraOpened).containsExactly("10")
        assertThat(zoom.state.value.selectedCameraId).isEqualTo("10")
        assertThat(zoom.state.value.facing).isEqualTo(CameraFacing.External)
        assertThat(zoom.state.value.isZoomable).isFalse()
    }

    @Test
    fun `choisir la camera deja cochee ou inconnue ne rouvre rien`() {
        val actuator = Actuator()
        val zoom = attached(actuator)
        assertThat(zoom.selectCamera("0")).isFalse()
        assertThat(zoom.selectCamera("99")).isFalse()
        assertThat(actuator.cameraOpened).isEmpty()
    }

    @Test
    fun `une camera qui refuse de s'ouvrir laisse l'etat intact`() {
        val zoom = attached(Actuator(opens = false))
        assertThat(zoom.selectCamera("10")).isFalse()
        assertThat(zoom.state.value.selectedCameraId).isEqualTo("0")
        assertThat(zoom.state.value.facing).isEqualTo(CameraFacing.Back)
    }

    @Test
    fun `detacher oublie les cameras`() {
        val zoom = attached(Actuator())
        zoom.detach()
        assertThat(zoom.state.value.cameras).isEmpty()
        assertThat(zoom.state.value.facing).isNull()
    }
}
