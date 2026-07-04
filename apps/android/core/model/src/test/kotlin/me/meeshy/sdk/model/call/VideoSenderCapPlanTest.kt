package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure adaptive video-sender-cap plan — the SSOT that
 * turns a [VideoQualityLevel] (and the device thermal tier) into the concrete RTP
 * sender parameters (`maxBitrateBps` / `maxFramerate` / `scaleResolutionDownBy`)
 * a future WebRTC actuator applies to the outbound video track.
 *
 * Port of iOS `WebRTCService.applyVideoQuality` composed with `VideoThermalProfile`
 * — every level's cap and every thermal ceiling arm is pinned, plus the CRITICAL
 * floor (no zero-encoder) and the per-axis "more conservative wins" composition.
 */
class VideoSenderCapPlanTest {

    // --- network cap per quality level -----------------------------------------

    @Test
    fun `excellent maps to full 720p30 at max bitrate with no downscale`() {
        val cap = VideoSenderCapPlan.forLevel(VideoQualityLevel.EXCELLENT)
        assertThat(cap.maxBitrateBps).isEqualTo(2_500_000)
        assertThat(cap.maxFramerate).isEqualTo(30)
        assertThat(cap.scaleResolutionDownBy).isEqualTo(1.0)
    }

    @Test
    fun `good stays 720p but at 24fps and a lower bitrate`() {
        val cap = VideoSenderCapPlan.forLevel(VideoQualityLevel.GOOD)
        assertThat(cap.maxBitrateBps).isEqualTo(1_500_000)
        assertThat(cap.maxFramerate).isEqualTo(24)
        assertThat(cap.scaleResolutionDownBy).isEqualTo(1.0)
    }

    @Test
    fun `fair downscales to 480p at 20fps`() {
        val cap = VideoSenderCapPlan.forLevel(VideoQualityLevel.FAIR)
        assertThat(cap.maxBitrateBps).isEqualTo(800_000)
        assertThat(cap.maxFramerate).isEqualTo(20)
        assertThat(cap.scaleResolutionDownBy).isEqualTo(720.0 / 480.0)
    }

    @Test
    fun `poor downscales to 360p at 15fps`() {
        val cap = VideoSenderCapPlan.forLevel(VideoQualityLevel.POOR)
        assertThat(cap.maxBitrateBps).isEqualTo(400_000)
        assertThat(cap.maxFramerate).isEqualTo(15)
        assertThat(cap.scaleResolutionDownBy).isEqualTo(720.0 / 360.0)
    }

    @Test
    fun `critical floors to 360p15 at the minimum bitrate instead of a zero encoder`() {
        val cap = VideoSenderCapPlan.forLevel(VideoQualityLevel.CRITICAL)
        assertThat(cap.maxBitrateBps).isEqualTo(CallQualityThresholds.MIN_VIDEO_BITRATE_BPS)
        assertThat(cap.maxFramerate).isEqualTo(CallQualityThresholds.CRITICAL_VIDEO_FLOOR_FPS)
        assertThat(cap.scaleResolutionDownBy)
            .isEqualTo(720.0 / CallQualityThresholds.CRITICAL_VIDEO_FLOOR_HEIGHT)
    }

    @Test
    fun `scaleResolutionDownBy is never below 1 so the encoder never upscales`() {
        VideoQualityLevel.entries.forEach { level ->
            assertThat(VideoSenderCapPlan.forLevel(level).scaleResolutionDownBy).isAtLeast(1.0)
        }
    }

    // --- thermal ceiling -------------------------------------------------------

    @Test
    fun `nominal thermal ceiling is a strict no-op`() {
        val ceiling = ThermalCeiling.forState(ThermalState.NOMINAL)
        assertThat(ceiling.bitrateFactor).isEqualTo(1.0)
        assertThat(ceiling.maxFramerate).isEqualTo(60)
        assertThat(ceiling.minScaleDownBy).isEqualTo(1.0)
    }

    @Test
    fun `fair thermal ceiling trims bitrate and caps fps at 30`() {
        val ceiling = ThermalCeiling.forState(ThermalState.FAIR)
        assertThat(ceiling.bitrateFactor).isEqualTo(0.8)
        assertThat(ceiling.maxFramerate).isEqualTo(30)
        assertThat(ceiling.minScaleDownBy).isEqualTo(1.0)
    }

    @Test
    fun `serious thermal ceiling halves bitrate and forces a downscale`() {
        val ceiling = ThermalCeiling.forState(ThermalState.SERIOUS)
        assertThat(ceiling.bitrateFactor).isEqualTo(0.5)
        assertThat(ceiling.maxFramerate).isEqualTo(24)
        assertThat(ceiling.minScaleDownBy).isEqualTo(1.5)
    }

    @Test
    fun `critical thermal ceiling sheds the most load`() {
        val ceiling = ThermalCeiling.forState(ThermalState.CRITICAL)
        assertThat(ceiling.bitrateFactor).isEqualTo(0.3)
        assertThat(ceiling.maxFramerate).isEqualTo(15)
        assertThat(ceiling.minScaleDownBy).isEqualTo(2.0)
    }

    // --- composition: more conservative value wins per axis --------------------

    @Test
    fun `a nominal device keeps the full network cap`() {
        val net = VideoSenderCapPlan.forLevel(VideoQualityLevel.EXCELLENT)
        val composed = VideoSenderCapPlan.forConditions(VideoQualityLevel.EXCELLENT, ThermalState.NOMINAL)
        assertThat(composed).isEqualTo(net)
    }

    @Test
    fun `a hot device sheds bitrate and fps even on an excellent link`() {
        val composed = VideoSenderCapPlan.forConditions(VideoQualityLevel.EXCELLENT, ThermalState.CRITICAL)
        // 2_500_000 * 0.3 = 750_000; fps min(30, 15) = 15; scale max(1.0, 2.0) = 2.0
        assertThat(composed.maxBitrateBps).isEqualTo(750_000)
        assertThat(composed.maxFramerate).isEqualTo(15)
        assertThat(composed.scaleResolutionDownBy).isEqualTo(2.0)
    }

    @Test
    fun `the network fps wins when it is already below the thermal cap`() {
        // POOR is 15fps; a FAIR thermal cap of 30 must not raise it back up.
        val composed = VideoSenderCapPlan.forConditions(VideoQualityLevel.POOR, ThermalState.FAIR)
        assertThat(composed.maxFramerate).isEqualTo(15)
    }

    @Test
    fun `the network downscale wins when it is already steeper than the thermal floor`() {
        // POOR scales 720/360 = 2.0; SERIOUS floor is 1.5, so the steeper 2.0 stays.
        val composed = VideoSenderCapPlan.forConditions(VideoQualityLevel.POOR, ThermalState.SERIOUS)
        assertThat(composed.scaleResolutionDownBy).isEqualTo(2.0)
    }

    @Test
    fun `the thermal floor raises a gentle network downscale`() {
        // GOOD has no downscale (1.0); a SERIOUS floor of 1.5 must lift it.
        val composed = VideoSenderCapPlan.forConditions(VideoQualityLevel.GOOD, ThermalState.SERIOUS)
        assertThat(composed.scaleResolutionDownBy).isEqualTo(1.5)
    }

    @Test
    fun `composed bitrate is rounded to the nearest integer bps`() {
        // GOOD 1_500_000 * 0.8 = 1_200_000 exactly (no rounding artefact).
        val composed = VideoSenderCapPlan.forConditions(VideoQualityLevel.GOOD, ThermalState.FAIR)
        assertThat(composed.maxBitrateBps).isEqualTo(1_200_000)
    }

    @Test
    fun `composed values never collapse below the hard floors of 1`() {
        VideoQualityLevel.entries.forEach { level ->
            ThermalState.entries.forEach { thermal ->
                val cap = VideoSenderCapPlan.forConditions(level, thermal)
                assertThat(cap.maxBitrateBps).isAtLeast(1)
                assertThat(cap.maxFramerate).isAtLeast(1)
                assertThat(cap.scaleResolutionDownBy).isAtLeast(1.0)
            }
        }
    }
}
