package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure in-call video-filter model: the neutral
 * default, the advanced-filter predicate, and the five colour presets — each
 * pinned by its observed field values (temperature/tint/brightness/contrast/
 * saturation/exposure), never by internal wiring. Port of iOS
 * `VideoFilterConfig` / `VideoFilterPreset` in `VideoFilterPipeline.swift`.
 */
class VideoFilterConfigTest {

    // --- default -------------------------------------------------------------

    @Test
    fun `default config is neutral and disabled with no advanced filters`() {
        val c = VideoFilterConfig.DEFAULT
        assertThat(c.temperature).isEqualTo(6500f)
        assertThat(c.tint).isEqualTo(0f)
        assertThat(c.brightness).isEqualTo(0f)
        assertThat(c.contrast).isEqualTo(1.0f)
        assertThat(c.saturation).isEqualTo(1.0f)
        assertThat(c.exposure).isEqualTo(0f)
        assertThat(c.isEnabled).isFalse()
        assertThat(c.backgroundBlurEnabled).isFalse()
        assertThat(c.backgroundBlurRadius).isEqualTo(10.0)
        assertThat(c.skinSmoothingEnabled).isFalse()
        assertThat(c.skinSmoothingIntensity).isEqualTo(0.4f)
        assertThat(c.hasAdvancedFilters).isFalse()
    }

    // --- hasAdvancedFilters --------------------------------------------------

    @Test
    fun `background blur alone counts as an advanced filter`() {
        assertThat(VideoFilterConfig.DEFAULT.copy(backgroundBlurEnabled = true).hasAdvancedFilters)
            .isTrue()
    }

    @Test
    fun `skin smoothing alone counts as an advanced filter`() {
        assertThat(VideoFilterConfig.DEFAULT.copy(skinSmoothingEnabled = true).hasAdvancedFilters)
            .isTrue()
    }

    @Test
    fun `both advanced filters enabled counts as advanced`() {
        val c = VideoFilterConfig.DEFAULT.copy(
            backgroundBlurEnabled = true,
            skinSmoothingEnabled = true,
        )
        assertThat(c.hasAdvancedFilters).isTrue()
    }

    // --- presets: every preset enables the pipeline --------------------------

    @Test
    fun `every preset yields an enabled config`() {
        VideoFilterPreset.entries.forEach { preset ->
            assertThat(preset.config.isEnabled).isTrue()
        }
    }

    // --- presets: exact colorimetry ------------------------------------------

    @Test
    fun `natural preset is the neutral colorimetry, just enabled`() {
        val c = VideoFilterPreset.Natural.config
        assertThat(c.temperature).isEqualTo(6500f)
        assertThat(c.tint).isEqualTo(0f)
        assertThat(c.brightness).isEqualTo(0f)
        assertThat(c.contrast).isEqualTo(1.0f)
        assertThat(c.saturation).isEqualTo(1.0f)
        assertThat(c.exposure).isEqualTo(0f)
    }

    @Test
    fun `warm preset raises temperature and tint toward amber`() {
        val c = VideoFilterPreset.Warm.config
        assertThat(c.temperature).isEqualTo(7500f)
        assertThat(c.tint).isEqualTo(5f)
        assertThat(c.brightness).isEqualTo(0.02f)
        assertThat(c.contrast).isEqualTo(1.05f)
        assertThat(c.saturation).isEqualTo(1.1f)
        assertThat(c.exposure).isEqualTo(0f)
    }

    @Test
    fun `cool preset lowers temperature and tint toward blue`() {
        val c = VideoFilterPreset.Cool.config
        assertThat(c.temperature).isEqualTo(5500f)
        assertThat(c.tint).isEqualTo(-5f)
        assertThat(c.brightness).isEqualTo(0f)
        assertThat(c.contrast).isEqualTo(1.05f)
        assertThat(c.saturation).isEqualTo(0.95f)
        assertThat(c.exposure).isEqualTo(0f)
    }

    @Test
    fun `vivid preset pushes contrast saturation and exposure up`() {
        val c = VideoFilterPreset.Vivid.config
        assertThat(c.temperature).isEqualTo(6500f)
        assertThat(c.tint).isEqualTo(0f)
        assertThat(c.brightness).isEqualTo(0.03f)
        assertThat(c.contrast).isEqualTo(1.15f)
        assertThat(c.saturation).isEqualTo(1.3f)
        assertThat(c.exposure).isEqualTo(0.1f)
    }

    @Test
    fun `muted preset pulls contrast saturation and exposure down`() {
        val c = VideoFilterPreset.Muted.config
        assertThat(c.temperature).isEqualTo(6500f)
        assertThat(c.tint).isEqualTo(0f)
        assertThat(c.brightness).isEqualTo(-0.02f)
        assertThat(c.contrast).isEqualTo(0.9f)
        assertThat(c.saturation).isEqualTo(0.7f)
        assertThat(c.exposure).isEqualTo(-0.1f)
    }

    @Test
    fun `no preset enables an advanced filter by default`() {
        VideoFilterPreset.entries.forEach { preset ->
            assertThat(preset.config.hasAdvancedFilters).isFalse()
        }
    }

    // --- lookup by id (round-trips the persisted raw value) ------------------

    @Test
    fun `presets round-trip through their stable id`() {
        VideoFilterPreset.entries.forEach { preset ->
            assertThat(VideoFilterPreset.fromId(preset.id)).isEqualTo(preset)
        }
    }

    @Test
    fun `an unknown preset id resolves to null`() {
        assertThat(VideoFilterPreset.fromId("sepia")).isNull()
        assertThat(VideoFilterPreset.fromId("")).isNull()
    }
}
