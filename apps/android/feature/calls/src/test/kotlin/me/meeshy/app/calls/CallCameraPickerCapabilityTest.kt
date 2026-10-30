package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.camera.CameraDeviceOption
import me.meeshy.sdk.model.call.camera.CameraFacing
import org.junit.Test

class CallCameraPickerCapabilityTest {
    private val phone = listOf(CameraDeviceOption("1", CameraFacing.Front), CameraDeviceOption("0", CameraFacing.Back))
    private val plugged = phone + CameraDeviceOption("10", CameraFacing.External)

    private fun state(isVideo: Boolean = true, camera: Boolean = true) = CallPresenter.present(
        state = CallState.Connected,
        config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = isVideo, isOutgoing = true),
        media = CallMedia(isCameraOn = camera),
        videoAutoPaused = false,
        mediaEstablished = true,
    )

    private fun handler(cameras: List<CameraDeviceOption>, picker: CallCameraPickerController = CallCameraPickerController()) =
        CallCameraPickerActionHandler(CallCameraChoices { cameras }, picker)

    @Test
    fun `sans camera branchee, le choix n'est pas offert et la bascule reste`() {
        val offered = listOfNotNull(handler(phone).present(state())?.let { OfferedCallAction(CallAction.CameraPicker, it) })
        val items = CallPillModel.items(state(), offered)
        val available = CallPillModel.available(state(), items) { it == CallAction.CameraPicker }
        assertThat(offered).isEmpty()
        assertThat(available.myImage).contains(CallAction.FlipCamera)
        assertThat(available.myImage).doesNotContain(CallAction.CameraPicker)
    }

    @Test
    fun `une camera branchee remplace la bascule par le choix, a la meme place`() {
        val presentation = handler(plugged).present(state())
        assertThat(presentation?.labelRes).isEqualTo(R.string.call_control_camera)
        val items = CallPillModel.items(state(), listOf(OfferedCallAction(CallAction.CameraPicker, presentation!!)))
        val available = CallPillModel.available(state(), items) { it == CallAction.CameraPicker }
        assertThat(available.myImage).containsExactly(CallAction.Camera, CallAction.CameraPicker).inOrder()
        assertThat(available.myImage).doesNotContain(CallAction.FlipCamera)
    }

    @Test
    fun `camera coupee ou appel audio, pas de choix`() {
        assertThat(handler(plugged).present(state(camera = false))).isNull()
        assertThat(handler(plugged).present(state(isVideo = false))).isNull()
    }

    @Test
    fun `le toucher ouvre la feuille, la fin de l'appel la referme`() {
        val picker = CallCameraPickerController()
        handler(plugged, picker).perform()
        assertThat(picker.isOpen.value).isTrue()
        picker.onTransition(CallState.Connected, CallState.Idle, CallSessionInfo("c1", CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true)))
        assertThat(picker.isOpen.value).isFalse()
    }
}
