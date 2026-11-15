package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayer
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
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
    fun `the session hands its stack to the call at each change, the Montage reads it from there (#16979)`() {
        val rig = Rig()
        rig.controller.change { it.selecting(CallFaceEffect.Toad) }
        rig.controller.change { it.selecting(VideoFilterPreset.Golden) }
        assertThat(rig.effects.layers.value.bottomToTop.map { it.kind }).containsExactly(CallEffectKind.Face, CallEffectKind.Color).inOrder()
        rig.controller.change { it.removing(CallEffectKind.Face) }
        assertThat(rig.effects.layers.value.bottomToTop.map { it.kind }).containsExactly(CallEffectKind.Color)
        assertThat(rig.effects.config.value.faceEffect).isEqualTo(CallFaceEffect.None)
    }

    @Test
    fun `the session resumes the stack the call holds, the frame the Montage chose stays in it`() {
        val rig = Rig()
        rig.effects.setLayers(CallEffectLayers.of(listOf(CallEffectLayer(CallEffectKind.Frame, "frame-1"))))
        val resumed = CallEffectsController(rig.effects)
        resumed.change { it.selecting(CallFaceEffect.Angel) }
        assertThat(rig.effects.layers.value.bottomToTop.map { it.kind }).containsExactly(CallEffectKind.Frame, CallEffectKind.Face).inOrder()
    }

    @Test
    fun `the mode opens on the row the Montage asked for, once`() {
        val rig = Rig()
        rig.effects.requestEffectsCategory(CallEffectsCategory.Color)
        assertThat(CallEffectsController(rig.effects).state.value.category).isEqualTo(CallEffectsCategory.Color)
        assertThat(CallEffectsController(rig.effects).state.value.category).isEqualTo(CallEffectsCategory.Face)
    }

    /**
     * #17819 — la couche d'Effets fond en sortant : rentrer dans le mode pendant ce fondu retrouve la même couche, encore
     * composée. Une session close par ‹ s'y rouvre, sur la rangée demandée et la pile que l'appel tient, comme une entrée neuve.
     */
    @Test
    fun `re-entering while the layer still fades reopens a session closed by back, as a fresh entry`() {
        val rig = Rig()
        rig.controller.change { it.selecting(CallFaceEffect.Angel) }
        rig.controller.finish()
        rig.effects.requestEffectsCategory(CallEffectsCategory.Color)

        rig.controller.reopen()

        assertThat(rig.controller.state.value.category).isEqualTo(CallEffectsCategory.Color)
        rig.controller.change { it.selecting(VideoFilterPreset.Warm) }
        assertThat(rig.effects.layers.value.bottomToTop.map { it.kind }).containsExactly(CallEffectKind.Face, CallEffectKind.Color).inOrder()
        assertThat(rig.effects.config.value.faceEffect).isEqualTo(CallFaceEffect.Angel)
        assertThat(rig.effects.config.value.activePresetId()).isEqualTo(VideoFilterPreset.Warm)
        assertThat(rig.controller.finish()).isTrue()
    }

    @Test
    fun `re-entering a session still open changes nothing, the row asked for stays to come`() {
        val rig = Rig()
        rig.controller.change { it.selecting(CallFaceEffect.Toad) }
        val before = rig.controller.state.value
        rig.effects.requestEffectsCategory(CallEffectsCategory.Color)

        rig.controller.reopen()

        assertThat(rig.controller.state.value).isEqualTo(before)
        assertThat(CallEffectsController(rig.effects).state.value.category).isEqualTo(CallEffectsCategory.Color)
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
