package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.junit.Test

/** Mêmes vecteurs que iOS `CallDataProfileTests`. */
class CallDataProfileTest {

    private val cellularPath = CallNetworkPath(isExpensive = true, isConstrained = false)
    private val saverPath = CallNetworkPath(isExpensive = false, isConstrained = true)

    @Test
    fun `an unrestricted healthy path is wifi`() {
        assertThat(CallDataProfile.resolve(CallNetworkPath.UNRESTRICTED, VideoQualityLevel.EXCELLENT, CallDataProfile.WIFI))
            .isEqualTo(CallDataProfile.WIFI)
    }

    @Test
    fun `an expensive path is cellular`() {
        assertThat(CallDataProfile.resolve(cellularPath, VideoQualityLevel.GOOD, CallDataProfile.WIFI)).isEqualTo(CallDataProfile.CELLULAR)
    }

    @Test
    fun `the system data saver wins even on an unmetered link`() {
        assertThat(CallDataProfile.resolve(saverPath, VideoQualityLevel.EXCELLENT, CallDataProfile.WIFI)).isEqualTo(CallDataProfile.DATA_SAVER)
    }

    @Test
    fun `data saver beats expensive when both hold`() {
        val both = CallNetworkPath(isExpensive = true, isConstrained = true)
        assertThat(CallDataProfile.resolve(both, VideoQualityLevel.GOOD, CallDataProfile.CELLULAR)).isEqualTo(CallDataProfile.DATA_SAVER)
    }

    @Test
    fun `a poor or critical link is degraded whatever the path`() {
        assertThat(CallDataProfile.resolve(CallNetworkPath.UNRESTRICTED, VideoQualityLevel.POOR, CallDataProfile.WIFI)).isEqualTo(CallDataProfile.DEGRADED)
        assertThat(CallDataProfile.resolve(saverPath, VideoQualityLevel.CRITICAL, CallDataProfile.DATA_SAVER)).isEqualTo(CallDataProfile.DEGRADED)
    }

    @Test
    fun `a fair tick does not thaw the degraded tier`() {
        assertThat(CallDataProfile.resolve(CallNetworkPath.UNRESTRICTED, VideoQualityLevel.FAIR, CallDataProfile.DEGRADED))
            .isEqualTo(CallDataProfile.DEGRADED)
    }

    @Test
    fun `a good tick lifts degraded back to the path profile`() {
        assertThat(CallDataProfile.resolve(cellularPath, VideoQualityLevel.GOOD, CallDataProfile.DEGRADED)).isEqualTo(CallDataProfile.CELLULAR)
    }

    @Test
    fun `a fair tick while healthy keeps the path profile`() {
        assertThat(CallDataProfile.resolve(CallNetworkPath.UNRESTRICTED, VideoQualityLevel.FAIR, CallDataProfile.WIFI)).isEqualTo(CallDataProfile.WIFI)
    }

    @Test
    fun `the video budgets are the reference table`() {
        assertThat(CallDataProfile.WIFI.budget.video).isEqualTo(CallVideoBudget(1_500_000, 30, 1.0, VideoDegradation.MaintainFramerate))
        assertThat(CallDataProfile.CELLULAR.budget.video).isEqualTo(CallVideoBudget(600_000, 24, 1.5, VideoDegradation.MaintainFramerate))
        assertThat(CallDataProfile.DATA_SAVER.budget.video).isEqualTo(CallVideoBudget(250_000, 15, 2.0, VideoDegradation.MaintainResolution))
        assertThat(CallDataProfile.DEGRADED.budget.video).isEqualTo(CallVideoBudget(150_000, 15, 2.0, VideoDegradation.MaintainResolution))
    }

    @Test
    fun `budgets shrink monotonically from wifi to degraded`() {
        val budgets = listOf(CallDataProfile.WIFI, CallDataProfile.CELLULAR, CallDataProfile.DATA_SAVER, CallDataProfile.DEGRADED).map { it.budget }
        budgets.zipWithNext().forEach { (richer, leaner) ->
            assertThat(richer.video.maxBitrateBps).isGreaterThan(leaner.video.maxBitrateBps)
            assertThat(richer.video.maxFramerate).isAtLeast(leaner.video.maxFramerate)
            assertThat(richer.video.scaleResolutionDownBy).isAtMost(leaner.video.scaleResolutionDownBy)
            assertThat(richer.audio.maxAverageBitrateBps).isGreaterThan(leaner.audio.maxAverageBitrateBps)
        }
    }

    @Test
    fun `the voice budget stays in the opus voice range and never undercuts the encoder floor`() {
        assertThat(CallDataProfile.WIFI.budget.audio.maxAverageBitrateBps).isEqualTo(32_000)
        assertThat(CallDataProfile.CELLULAR.budget.audio.maxAverageBitrateBps).isEqualTo(24_000)
        assertThat(CallDataProfile.DEGRADED.budget.audio.maxAverageBitrateBps).isLessThan(24_000)
        assertThat(CallDataProfile.DEGRADED.budget.audio.maxAverageBitrateBps).isAtLeast(CallAudioBudget.CODEC_FLOOR_BITRATE_BPS)
    }

    @Test
    fun `audio capping takes the leaner ceiling`() {
        assertThat(CallDataProfile.WIFI.budget.audio.capping(CallQualityThresholds.MAX_AUDIO_BITRATE_BPS)).isEqualTo(32_000)
        assertThat(CallDataProfile.WIFI.budget.audio.capping(CallQualityThresholds.MIN_AUDIO_BITRATE_BPS)).isEqualTo(24_000)
    }

    @Test
    fun `video capping by a profile takes the leaner value on every axis and imposes its preference`() {
        val ladder = CallVideoBudget(800_000, 20, 1.5, VideoDegradation.MaintainFramerate)
        assertThat(CallDataProfile.DATA_SAVER.budget.video.capping(ladder))
            .isEqualTo(CallVideoBudget(250_000, 15, 2.0, VideoDegradation.MaintainResolution))
        assertThat(CallDataProfile.WIFI.budget.video.capping(CallVideoBudget.SURVIVAL_FLOOR)).isEqualTo(CallVideoBudget.SURVIVAL_FLOOR)
    }

    @Test
    fun `the opus fmtp is mono voice with dtx and in-band fec`() {
        val params = CallDataProfile.CELLULAR.budget.audio.fmtpParameters
        assertThat(params).containsAtLeast("maxaveragebitrate=24000", "stereo=0", "sprop-stereo=0", "usedtx=1", "useinbandfec=1", "maxplaybackrate=48000")
    }

    @Test
    fun `the wire name round trips for the journal`() {
        CallDataProfile.entries.forEach { assertThat(CallDataProfile.fromWireName(it.wireName)).isEqualTo(it) }
        assertThat(CallDataProfile.fromWireName("nope")).isNull()
    }
}
