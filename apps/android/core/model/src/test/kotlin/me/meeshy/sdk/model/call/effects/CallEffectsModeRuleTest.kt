package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import org.junit.Test

class CallEffectsModeRuleTest {

    @Test
    fun `the categories keep iOS order, face then colour`() {
        assertThat(CallEffectsCategory.entries).containsExactly(CallEffectsCategory.Face, CallEffectsCategory.Color).inOrder()
    }

    @Test
    fun `the face catalogue offers the six effects of iOS, in iOS order`() {
        assertThat(CallEffectsModeRule.faces.map { it.id })
            .containsExactly("none", "smoothing", "toad", "angel", "demon", "volcano").inOrder()
    }

    @Test
    fun `the colours are the eight moods of iOS, in iOS order, the four older tints no longer offered`() {
        assertThat(CallEffectsModeRule.colors.map { it.id })
            .containsExactly("natural", "golden", "film", "softNight", "bright", "velvet", "sky", "monochrome").inOrder()
    }

    @Test
    fun `an older tint stays readable and selectable by a call that carries it`() {
        val warm = CallEffectsModeRule.applying(VideoFilterPreset.Warm, VideoFilterConfig())
        assertThat(CallEffectsModeRule.colorSelection(warm)).isEqualTo(VideoFilterPreset.Warm)
        assertThat(VideoFilterPreset.fromId("muted")).isEqualTo(VideoFilterPreset.Muted)
    }

    @Test
    fun `every mood of the catalogue applies and is read back as itself`() {
        CallEffectsModeRule.colors.forEach { mood ->
            val applied = CallEffectsModeRule.applying(mood, VideoFilterConfig())
            assertThat(CallEffectsModeRule.colorSelection(applied)).isEqualTo(mood)
            assertThat(applied.isEnabled).isEqualTo(mood != VideoFilterPreset.Natural)
        }
    }

    @Test
    fun `picking a look keeps blur and smoothing, picking Natural turns the colour off`() {
        val start = VideoFilterConfig(backgroundBlurEnabled = true, skinSmoothingEnabled = true, faceEffect = CallFaceEffect.Smoothing)
        val warm = CallEffectsModeRule.applying(VideoFilterPreset.Warm, start)
        assertThat(warm.isEnabled).isTrue()
        assertThat(warm.backgroundBlurEnabled).isTrue()
        assertThat(warm.skinSmoothingEnabled).isTrue()
        assertThat(CallEffectsModeRule.colorSelection(warm)).isEqualTo(VideoFilterPreset.Warm)

        val natural = CallEffectsModeRule.applying(VideoFilterPreset.Natural, warm)
        assertThat(natural.isEnabled).isFalse()
        assertThat(natural.backgroundBlurEnabled).isTrue()
        assertThat(CallEffectsModeRule.colorSelection(natural)).isEqualTo(VideoFilterPreset.Natural)
    }

    @Test
    fun `a face effect is exclusive and only smoothing lights its flag`() {
        val state = CallEffectsModeState.opening(VideoFilterConfig())
        val smoothing = state.selecting(CallFaceEffect.Smoothing)
        assertThat(smoothing.face).isEqualTo(CallFaceEffect.Smoothing)
        assertThat(smoothing.current.skinSmoothingEnabled).isTrue()
        assertThat(smoothing.showsSmoothingStrength).isTrue()
        val none = smoothing.selecting(CallFaceEffect.None)
        assertThat(none.face).isEqualTo(CallFaceEffect.None)
        assertThat(none.current.hasChosenFilters).isFalse()
        assertThat(none.showsSmoothingStrength).isFalse()
    }

    @Test
    fun `quitting restores the image as it was, validating keeps the trial`() {
        val original = VideoFilterConfig(backgroundBlurEnabled = true)
        val tried = CallEffectsModeState.opening(original).selecting(VideoFilterPreset.Vivid).togglingBlur()
        assertThat(tried.exiting(validated = false)).isEqualTo(original)
        assertThat(tried.exiting(validated = true)).isEqualTo(tried.current)
        assertThat(tried.current.backgroundBlurEnabled).isFalse()
    }

    @Test
    fun `brightness is bounded and smoothing never drops to zero`() {
        val state = CallEffectsModeState.opening(VideoFilterConfig())
        assertThat(state.withBrightness(2f).current.brightness).isEqualTo(0.3f)
        assertThat(state.withBrightness(-2f).current.brightness).isEqualTo(-0.3f)
        assertThat(state.withBrightness(0.1f).current.isEnabled).isTrue()
        assertThat(state.withSmoothing(0f).current.skinSmoothingIntensity).isEqualTo(0.1f)
        assertThat(state.withSmoothing(4f).current.skinSmoothingIntensity).isEqualTo(1f)
    }

    @Test
    fun `brightness on top of a look keeps the look recognised`() {
        val warm = CallEffectsModeState.opening(VideoFilterConfig()).selecting(VideoFilterPreset.Cool).withBrightness(0.2f)
        assertThat(warm.color).isEqualTo(VideoFilterPreset.Cool)
    }

    @Test
    fun `the settings row and the category toggle without touching the image`() {
        val state = CallEffectsModeState.opening(VideoFilterConfig())
        assertThat(state.category).isEqualTo(CallEffectsCategory.Face)
        val shown = state.showing(CallEffectsCategory.Color).togglingSettings()
        assertThat(shown.category).isEqualTo(CallEffectsCategory.Color)
        assertThat(shown.showsSettings).isTrue()
        assertThat(shown.current).isEqualTo(state.current)
    }

    @Test
    fun `TalkBack steps are bounded and never wrap`() {
        val items = listOf("a", "b", "c")
        assertThat(CallEffectsModeRule.stepping("b", items, 1)).isEqualTo("c")
        assertThat(CallEffectsModeRule.stepping("c", items, 1)).isEqualTo("c")
        assertThat(CallEffectsModeRule.stepping("a", items, -1)).isEqualTo("a")
        assertThat(CallEffectsModeRule.stepping("z", items, 1)).isEqualTo("a")
    }

    @Test
    fun `a stylized face effect counts as advanced and as chosen`() {
        val toad = VideoFilterConfig(faceEffect = CallFaceEffect.Toad)
        assertThat(toad.hasAdvancedFilters).isTrue()
        assertThat(toad.hasChosenFilters).isTrue()
        assertThat(CallFaceEffect.Volcano.needsFace).isFalse()
        assertThat(CallFaceEffect.None.analyticsName).isNull()
        assertThat(CallFaceEffect.Angel.analyticsName).isEqualTo("face:angel")
    }
}
