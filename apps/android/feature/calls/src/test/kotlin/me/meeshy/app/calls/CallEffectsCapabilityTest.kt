package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.call.activePreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayer
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsStackRule
import me.meeshy.sdk.model.call.selectingFaceEffect
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
    fun `serious heat sheds blur and smoothing from the sent image but keeps the chosen look`() {
        val sink = RecordingSink()
        val health = CallVideoHealthImpl()
        val controller = CallVideoEffectsController(sink, health)
        val chosen = warm.copy(backgroundBlurEnabled = true, skinSmoothingEnabled = true)
        controller.apply(chosen)
        health.setThermal(me.meeshy.sdk.model.call.ThermalState.SERIOUS)
        assertThat(sink.applied.last().backgroundBlurEnabled).isFalse()
        assertThat(sink.applied.last().skinSmoothingEnabled).isFalse()
        assertThat(sink.applied.last().temperature).isEqualTo(chosen.temperature)
        assertThat(controller.config.value).isEqualTo(chosen)
        health.setThermal(me.meeshy.sdk.model.call.ThermalState.NOMINAL)
        assertThat(sink.applied.last()).isEqualTo(chosen)
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
    fun `the stack of three layers belongs to one call too, its end empties it and forgets the requested row (#16979)`() {
        val controller = CallVideoEffectsController(RecordingSink())
        controller.setLayers(CallEffectLayers.of(listOf(CallEffectLayer(CallEffectKind.Frame, "frame-1"))))
        controller.requestEffectsCategory(CallEffectsCategory.Color)

        controller.onTransition(CallState.Connected, CallState.Ended(CallEndReason.Local), info)

        assertThat(controller.layers.value.isEmpty).isTrue()
        assertThat(controller.takeRequestedCategory()).isNull()
    }

    @Test
    fun `the row the Montage asks for is read once, by the mode that opens`() {
        val controller = CallVideoEffectsController(RecordingSink())
        controller.requestEffectsCategory(CallEffectsCategory.Color)

        assertThat(controller.takeRequestedCategory()).isEqualTo(CallEffectsCategory.Color)
        assertThat(controller.takeRequestedCategory()).isNull()
    }

    @Test
    fun `undoing a layer takes its setting off the sent image and the layer off the stack, the others stay (#16979)`() {
        val sink = RecordingSink()
        val controller = CallVideoEffectsController(sink)
        val config = VideoFilterConfig().applyingPreset(VideoFilterPreset.Golden).selectingFaceEffect(CallFaceEffect.Toad)
        controller.apply(config)
        controller.setLayers(CallEffectsStackRule.layers(CallEffectLayers.EMPTY, frame = "frame-1", config = config))

        controller.removeLayer(CallEffectKind.Color)

        assertThat(controller.config.value.activePreset).isNull()
        assertThat(controller.config.value.activeFaceEffect).isEqualTo(CallFaceEffect.Toad)
        assertThat(sink.applied.last().activePreset).isNull()
        assertThat(controller.layers.value.bottomToTop.map { it.kind }).containsExactly(CallEffectKind.Frame, CallEffectKind.Face).inOrder()
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
