package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.applyingPreset
import org.junit.Test

class CallEffectsCapabilityTest {
    private val info = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY)

    private class RecordingSink : CallVideoEffectsSink {
        val applied = mutableListOf<VideoFilterConfig>()
        override fun apply(config: VideoFilterConfig) {
            applied += config
        }
    }

    private fun state(isVideo: Boolean = true, camera: Boolean = true, callState: CallState = CallState.Connected) = CallPresenter.present(
        state = callState,
        config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = isVideo, isOutgoing = true),
        media = CallMedia(isCameraOn = camera),
        videoAutoPaused = false,
        mediaEstablished = true,
    )

    private val warm = VideoFilterConfig().applyingPreset(VideoFilterPreset.Warm)

    @Test
    fun `a chosen effect goes to the sent image at once, a repeat does not resend it`() {
        val sink = RecordingSink()
        val controller = CallVideoEffectsController(sink)
        controller.apply(warm)
        controller.apply(warm)
        assertThat(sink.applied).containsExactly(warm)
        assertThat(controller.config.value).isEqualTo(warm)
    }

    @Test
    fun `the effects belong to one call, its end brings the image back to neutral`() {
        val sink = RecordingSink()
        val controller = CallVideoEffectsController(sink)
        controller.apply(warm)
        controller.onTransition(CallState.Connected, CallState.Ended(CallEndReason.Local), info)
        assertThat(controller.config.value).isEqualTo(VideoFilterConfig.DEFAULT)
        assertThat(sink.applied.last()).isEqualTo(VideoFilterConfig.DEFAULT)
    }

    @Test
    fun `effects are offered on an established video call with the camera on, lit while one is chosen`() {
        val controller = CallVideoEffectsController(RecordingSink())
        val handler = CallEffectsActionHandler(controller)
        assertThat(handler.present(state())?.labelRes).isEqualTo(R.string.call_control_effects)
        assertThat(handler.present(state())?.isActive).isFalse()
        controller.apply(warm)
        assertThat(handler.present(state())?.isActive).isTrue()
    }

    @Test
    fun `no effects without my image`() {
        val handler = CallEffectsActionHandler(CallVideoEffectsController(RecordingSink()))
        assertThat(handler.present(state(isVideo = false))).isNull()
        assertThat(handler.present(state(camera = false))).isNull()
        assertThat(handler.present(state(callState = CallState.Ringing(true)))).isNull()
    }
}
