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
        var successes = 0
        val controller = CallEffectsController(effects) { successes++ }
    }

    @Test
    fun `every try goes to the sent image at once`() {
        val rig = Rig()
        rig.controller.change { it.selecting(VideoFilterPreset.Warm) }
        assertThat(rig.effects.config.value.activePresetId()).isEqualTo(VideoFilterPreset.Warm)
    }

    @Test
    fun `validating keeps the effect and signals success once`() {
        val rig = Rig()
        rig.controller.change { it.selecting(CallFaceEffect.Angel) }
        assertThat(rig.controller.finish(validated = true)).isTrue()
        assertThat(rig.effects.config.value.faceEffect).isEqualTo(CallFaceEffect.Angel)
        assertThat(rig.successes).isEqualTo(1)
        assertThat(rig.controller.finish(validated = true)).isFalse()
        assertThat(rig.successes).isEqualTo(1)
    }

    @Test
    fun `quitting restores the configuration the mode opened with, without haptics`() {
        val start = VideoFilterConfig().applyingPreset(VideoFilterPreset.Cool)
        val rig = Rig(start)
        rig.controller.change { it.selecting(CallFaceEffect.Demon) }
        rig.controller.change { it.togglingBlur() }
        assertThat(rig.controller.finish(validated = false)).isTrue()
        assertThat(rig.effects.config.value).isEqualTo(start)
        assertThat(rig.successes).isEqualTo(0)
    }

    @Test
    fun `nothing changes once the session is over`() {
        val rig = Rig()
        rig.controller.finish(validated = false)
        rig.controller.change { it.selecting(CallFaceEffect.Toad) }
        assertThat(rig.effects.config.value).isEqualTo(VideoFilterConfig.DEFAULT)
        assertThat(rig.controller.finish(validated = true)).isFalse()
    }
}

private fun VideoFilterConfig.activePresetId(): VideoFilterPreset =
    me.meeshy.sdk.model.call.effects.CallEffectsModeRule.colorSelection(this)
