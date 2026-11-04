package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoFilterPanelLawTest {
    private val neutral = VideoFilterConfig.DEFAULT

    @Test
    fun `the temperature slider is normalised over 3000 to 10000 kelvin`() {
        assertThat(VideoFilterSlider.Temperature.valueOf(neutral)).isWithin(1e-4f).of(0.5f)
        val warm = VideoFilterSlider.Temperature.applying(neutral, 1f)
        assertThat(warm.temperature).isEqualTo(10000f)
        assertThat(warm.isEnabled).isTrue()
    }

    @Test
    fun `a slider value is clamped to its range`() {
        assertThat(VideoFilterSlider.Contrast.applying(neutral, 9f).contrast).isEqualTo(1.5f)
        assertThat(VideoFilterSlider.Saturation.applying(neutral, -3f).saturation).isEqualTo(0f)
    }

    @Test
    fun `the value text is the signed offset from neutral`() {
        assertThat(VideoFilterSlider.Exposure.displayOf(neutral)).isEqualTo("0")
        assertThat(VideoFilterSlider.Exposure.displayOf(neutral.copy(exposure = 0.5f))).isEqualTo("+0.5")
        assertThat(VideoFilterSlider.Contrast.displayOf(neutral.copy(contrast = 0.7f))).isEqualTo("-0.3")
    }

    @Test
    fun `reset turns the colorimetry off and keeps the neutral values`() {
        val reset = VideoFilterPanelLaw.resetLook(VideoFilterPreset.Vivid.config)
        assertThat(reset.isEnabled).isFalse()
        assertThat(VideoFilterPreset.matching(reset)).isEqualTo(VideoFilterPreset.Natural)
        assertThat(VideoFilterPanelLaw.showsReset(reset)).isFalse()
        assertThat(VideoFilterPanelLaw.showsReset(VideoFilterPreset.Warm.config)).isTrue()
    }

    @Test
    fun `the active chip follows the colorimetry and not the advanced passes`() {
        val config = VideoFilterPreset.Cool.config.copy(backgroundBlurEnabled = true)
        assertThat(VideoFilterPanelLaw.isSelected(config, VideoFilterPreset.Cool)).isTrue()
        assertThat(VideoFilterPanelLaw.isSelected(config, VideoFilterPreset.Warm)).isFalse()
    }

    @Test
    fun `the blur radius stays between 5 and 20`() {
        assertThat(VideoFilterPanelLaw.withBlurRadius(neutral, 99f).backgroundBlurRadius).isEqualTo(20.0)
        assertThat(VideoFilterPanelLaw.withBlurRadius(neutral, 1f).backgroundBlurRadius).isEqualTo(5.0)
    }

    @Test
    fun `the default config is the only unmodified one`() {
        assertThat(VideoFilterPanelLaw.isModified(neutral)).isFalse()
        assertThat(VideoFilterPanelLaw.isModified(neutral.copy(naturalComplexionEnabled = false))).isTrue()
    }

    @Test
    fun `natural complexion on by default does not count as advanced`() {
        assertThat(neutral.naturalComplexionEnabled).isTrue()
        assertThat(neutral.hasAdvancedFilters).isFalse()
    }
}
