package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Subtitles
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallPillModelTest {
    private fun state(isVideo: Boolean = true, paused: Boolean = false, camera: Boolean = true) = CallPresenter.present(
        state = CallState.Connected,
        config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = isVideo, isOutgoing = true),
        media = CallMedia(isCameraOn = camera),
        videoAutoPaused = paused,
        mediaEstablished = true,
    )

    private fun offered(vararg actions: CallAction) = actions.map {
        OfferedCallAction(it, CallActionPresentation(Icons.Filled.Subtitles, R.string.call_action_camera))
    }

    @Test
    fun `an audio call offers no camera toggle`() {
        assertThat(CallPillModel.cameraItem(state(isVideo = false))).isNull()
    }

    @Test
    fun `the camera toggle is active while the camera is on`() {
        assertThat(CallPillModel.cameraItem(state())!!.kind).isEqualTo(CallPillKind.Active)
        assertThat(CallPillModel.cameraItem(state(camera = false))!!.kind).isEqualTo(CallPillKind.Normal)
    }

    @Test
    fun `the automatic pause turns the camera toggle amber and says so`() {
        val item = CallPillModel.cameraItem(state(paused = true))!!
        assertThat(item.kind).isEqualTo(CallPillKind.Warning)
        assertThat(item.labelRes).isEqualTo(R.string.call_control_video_paused)
        assertThat(item.captionRes).isEqualTo(R.string.call_control_video_paused_caption)
    }

    @Test
    fun `an action without a handler is absent from the rows`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions))
        val set = CallPillModel.available(state(), items) { it == CallAction.Captions }
        val rows = CallPillModel.rows(set, isCompactHeight = false)
        assertThat(rows.flatMap { it.actions }).containsExactly(CallAction.Camera, CallAction.Captions).inOrder()
        assertThat(CallAction.Journal in set).isFalse()
    }

    @Test
    fun `each family gets its own titled row`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions))
        val set = CallPillModel.available(state(), items) { false }
        val rows = CallPillModel.rows(set, isCompactHeight = false)
        assertThat(rows.map { it.family }).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
    }

    @Test
    fun `in compact height the rows fold into one untitled line`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions))
        val set = CallPillModel.available(state(), items) { false }
        val rows = CallPillModel.rows(set, isCompactHeight = true)
        assertThat(rows).hasSize(1)
        assertThat(rows.single().family).isNull()
        assertThat(rows.single().actions).containsExactly(CallAction.Camera, CallAction.Captions).inOrder()
    }

    @Test
    fun `a call with nothing to offer has no rows`() {
        val set = CallPillModel.available(state(isVideo = false), emptyMap()) { false }
        assertThat(CallPillModel.rows(set, isCompactHeight = false)).isEmpty()
    }

    @Test
    fun `recording is only in the law when a handler is registered`() {
        val items = CallPillModel.items(state(), offered(CallAction.Recording))
        assertThat(CallAction.Recording in CallPillModel.available(state(), items) { true }).isTrue()
        assertThat(CallAction.Recording in CallPillModel.available(state(), items) { false }).isFalse()
    }
}
