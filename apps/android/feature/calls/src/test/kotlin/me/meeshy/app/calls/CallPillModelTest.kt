package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import me.meeshy.sdk.model.call.CallCaptionsGate
import me.meeshy.sdk.model.call.CallControlsDisposition
import me.meeshy.sdk.model.call.CallGroupStageSizing
import me.meeshy.sdk.model.call.CallScreenLayer
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
    fun `an audio call offers the camera, which turns it into a video call`() {
        val item = CallPillModel.cameraItem(state(isVideo = false, camera = false))
        assertThat(item.action).isEqualTo(CallAction.Camera)
        assertThat(item.labelRes).isEqualTo(R.string.call_control_camera_on)
        assertThat(item.kind).isEqualTo(CallPillKind.Normal)
        assertThat(CallPillModel.items(state(isVideo = false, camera = false), emptyList()).keys).containsExactly(CallAction.Camera)
    }

    @Test
    fun `an audio call has the camera in the left rail but neither flip nor effects`() {
        val audio = state(isVideo = false, camera = false)
        val set = CallPillModel.available(audio, CallPillModel.items(audio, emptyList())) { false }
        assertThat(set.myImage).containsExactly(CallAction.Camera)
    }

    @Test
    fun `the flip camera action rides with a live camera only`() {
        assertThat(CallPillModel.flipItem(state())!!.action).isEqualTo(CallAction.FlipCamera)
        assertThat(CallPillModel.flipItem(state(camera = false))).isNull()
        assertThat(CallPillModel.flipItem(state(isVideo = false))).isNull()
        assertThat(CallPillModel.items(state(), emptyList()).keys).containsAtLeast(CallAction.Camera, CallAction.FlipCamera)
    }

    @Test
    fun `the camera toggle is active while the camera is on`() {
        assertThat(CallPillModel.cameraItem(state()).kind).isEqualTo(CallPillKind.Active)
        assertThat(CallPillModel.cameraItem(state(camera = false)).kind).isEqualTo(CallPillKind.Normal)
    }

    @Test
    fun `the automatic pause turns the camera toggle amber and says so`() {
        val item = CallPillModel.cameraItem(state(paused = true))
        assertThat(item.kind).isEqualTo(CallPillKind.Warning)
        assertThat(item.labelRes).isEqualTo(R.string.call_control_video_paused)
        assertThat(item.captionRes).isEqualTo(R.string.call_control_video_paused_caption)
    }

    @Test
    fun `an action without a handler is absent from the rows`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions))
        val set = CallPillModel.available(state(), items) { it == CallAction.Captions }
        val rows = CallGroupStageSizing.rows(set.familyRows, isCompactHeight = false)
        assertThat(rows.flatMap { it.actions }).containsExactly(CallAction.Camera, CallAction.FlipCamera, CallAction.Captions).inOrder()
        assertThat(CallAction.Journal in set).isFalse()
    }

    @Test
    fun `each family gets its own titled row`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions))
        val set = CallPillModel.available(state(), items) { false }
        val rows = CallGroupStageSizing.rows(set.familyRows, isCompactHeight = false)
        assertThat(rows.map { it.family }).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
    }

    @Test
    fun `in compact height the rows fold into one untitled line`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions))
        val set = CallPillModel.available(state(), items) { false }
        val rows = CallGroupStageSizing.rows(set.familyRows, isCompactHeight = true)
        assertThat(rows).hasSize(1)
        assertThat(rows.single().family).isNull()
        assertThat(rows.single().actions).containsExactly(CallAction.Camera, CallAction.FlipCamera, CallAction.Captions).inOrder()
    }

    @Test
    fun `a call with nothing to offer has no rows`() {
        val set = CallPillModel.available(state(isVideo = false), emptyMap()) { false }
        assertThat(CallGroupStageSizing.rows(set.familyRows, isCompactHeight = false)).isEmpty()
    }

    @Test
    fun `recording is only in the law when a handler is registered`() {
        val items = CallPillModel.items(state(), offered(CallAction.Recording))
        assertThat(CallAction.Recording in CallPillModel.available(state(), items) { true }).isTrue()
        assertThat(CallAction.Recording in CallPillModel.available(state(), items) { false }).isFalse()
    }
    @Test
    fun `my image stays a family of the rows whatever the camera zoom does (17327)`() {
        val items = CallPillModel.items(state(), offered(CallAction.Captions, CallAction.Effects))
        val set = CallPillModel.available(state(), items) { it == CallAction.Captions || it == CallAction.Effects }
        val rows = CallControlsDisposition.Rows.pillRows(set, CallScreenLayer.Menu)
        assertThat(rows.map { it.family }).containsExactly(CallActionFamily.MyImage, CallActionFamily.TheCall).inOrder()
        assertThat(rows.first().actions).contains(CallAction.Effects)
        assertThat(CallGroupStageSizing.rows(rows, isCompactHeight = true).single().actions).contains(CallAction.Effects)
    }

    @Test
    fun `the camera carries iOS's short legend, Camera, not Video (P12_2)`() {
        assertThat(CallPillModel.cameraItem(state()).captionRes).isEqualTo(R.string.call_control_camera_caption)
        assertThat(CallPillModel.cameraItem(state(camera = false)).captionRes).isEqualTo(R.string.call_control_camera_caption)
    }

    @Test
    fun `the call's journal and reactions carry their short legends (P12_3)`() {
        val connected = state()
        assertThat(CallCaptionsPresenter.journal(CallCaptionsChip(gate = CallCaptionsGate.Open))!!.captionRes).isEqualTo(R.string.call_captions_journal)
        assertThat(CallReactionsActionHandler().present(connected)!!.captionRes).isEqualTo(R.string.call_control_react_caption)
    }

    @Test
    fun `a recording in progress is the destructive red button, a toggle that is merely on stays a white disc (P12_5)`() {
        val recording = CallActionPresentation(Icons.Filled.Subtitles, R.string.call_recording_stop, isActive = true, isDestructive = true)
        val toggle = CallActionPresentation(Icons.Filled.Subtitles, R.string.call_recording_stop, isActive = true)
        val idle = CallActionPresentation(Icons.Filled.Subtitles, R.string.call_recording_start, isDestructive = true)
        assertThat(CallPillModel.kindOf(recording)).isEqualTo(CallPillKind.Destructive)
        assertThat(CallPillModel.kindOf(toggle)).isEqualTo(CallPillKind.Active)
        assertThat(CallPillModel.kindOf(idle)).isEqualTo(CallPillKind.Normal)
        val items = CallPillModel.items(state(), listOf(OfferedCallAction(CallAction.Recording, recording)))
        assertThat(items.getValue(CallAction.Recording).kind).isEqualTo(CallPillKind.Destructive)
    }

    @Test
    fun `the group stage lowers the rows so the grid keeps 140 dp, never above their 340 dp (P12_7)`() {
        assertThat(callPillRowsMaxHeight(stageHeight = 900.dp, hasGrid = true)).isEqualTo(340.dp)
        assertThat(callPillRowsMaxHeight(stageHeight = 600.dp, hasGrid = true)).isLessThan(340.dp)
        assertThat(callPillRowsMaxHeight(stageHeight = 600.dp, hasGrid = false)).isEqualTo(340.dp)
    }
}
