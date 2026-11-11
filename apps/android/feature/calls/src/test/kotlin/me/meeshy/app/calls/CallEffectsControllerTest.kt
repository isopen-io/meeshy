package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.applyingPreset
import org.junit.Test

class CallEffectsControllerTest {
    private class RecordingSink : CallVideoEffectsSink {
        val applied = mutableListOf<VideoFilterConfig>()
        override fun apply(config: VideoFilterConfig) {
            applied += config
        }
    }

    private class Rig(start: VideoFilterConfig = VideoFilterConfig.DEFAULT) {
        val sink = RecordingSink()
        val effects = CallVideoEffectsController(sink).also { it.apply(start) }
        val controller = CallEffectsController(effects)
    }

    @Test
    fun `every try goes to the sent image at once`() {
        val rig = Rig()
        rig.controller.change { it.selecting(VideoFilterPreset.Warm) }
        assertThat(rig.effects.config.value.activePresetId()).isEqualTo(VideoFilterPreset.Warm)
    }

    @Test
    fun `going back keeps the look and closes the session once`() {
        val rig = Rig()
        rig.controller.change { it.selecting(CallFaceEffect.Angel) }
        assertThat(rig.controller.finish()).isTrue()
        assertThat(rig.effects.config.value.faceEffect).isEqualTo(CallFaceEffect.Angel)
        assertThat(rig.controller.finish()).isFalse()
    }

    @Test
    fun `a mode that disappears by itself keeps the look too, nothing is undone`() {
        val start = VideoFilterConfig().applyingPreset(VideoFilterPreset.Cool)
        val rig = Rig(start)
        rig.controller.change { it.selecting(CallFaceEffect.Demon) }
        rig.controller.change { it.togglingBlur() }
        val kept = rig.effects.config.value
        rig.controller.finish()
        assertThat(rig.effects.config.value).isEqualTo(kept)
        assertThat(kept).isNotEqualTo(start)
    }

    @Test
    fun `nothing changes once the session is over`() {
        val rig = Rig()
        rig.controller.finish()
        rig.controller.change { it.selecting(CallFaceEffect.Toad) }
        assertThat(rig.effects.config.value).isEqualTo(VideoFilterConfig.DEFAULT)
        assertThat(rig.controller.finish()).isFalse()
    }
}

private fun VideoFilterConfig.activePresetId(): VideoFilterPreset =
    me.meeshy.sdk.model.call.effects.CallEffectsModeRule.colorSelection(this)
