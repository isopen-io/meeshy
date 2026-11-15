package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.junit.Test

/** L'échelle de l'émetteur vidéo, miroir de iOS `adjustBitrate` + `applyVideoQuality` + la survie vidéo (#13767). */
class CallVideoEncodingLadderTest {

    private fun CallVideoEncodingLadder.at(
        seconds: Double,
        sample: VideoQualityLevel,
        thermal: ThermalState = ThermalState.NOMINAL,
        wantsVideo: Boolean = true,
    ) = recording(sample, thermal, seconds, wantsVideo)

    @Test
    fun `the camera starts at the full 720p30 budget`() {
        assertThat(CallVideoEncodingLadder().budget).isEqualTo(CallVideoBudget.CAMERA)
    }

    @Test
    fun `a new tier rewrites the encoder, a steady one does not`() {
        val fair = CallVideoEncodingLadder().at(0.0, VideoQualityLevel.FAIR)
        assertThat(fair.reapply).isTrue()
        assertThat(fair.ladder.budget).isEqualTo(CallVideoBudget(800_000, 20, 1.5, VideoDegradation.MaintainFramerate))

        val steady = fair.ladder.at(5.0, VideoQualityLevel.FAIR)
        assertThat(steady.reapply).isFalse()
    }

    @Test
    fun `a tier changes at most once every five seconds`() {
        val fair = CallVideoEncodingLadder().at(0.0, VideoQualityLevel.FAIR).ladder
        val tooSoon = fair.at(4.0, VideoQualityLevel.GOOD)
        assertThat(tooSoon.reapply).isFalse()
        assertThat(tooSoon.ladder.level).isEqualTo(VideoQualityLevel.FAIR)

        val later = tooSoon.ladder.at(5.0, VideoQualityLevel.GOOD)
        assertThat(later.reapply).isTrue()
        assertThat(later.ladder.budget.maxBitrateBps).isEqualTo(1_500_000)
    }

    @Test
    fun `a thermal transition rewrites the encoder on a steady tier`() {
        val hot = CallVideoEncodingLadder().at(0.0, VideoQualityLevel.EXCELLENT, ThermalState.SERIOUS)
        assertThat(hot.reapply).isTrue()
        assertThat(hot.ladder.budget).isEqualTo(CallVideoBudget(1_250_000, 24, 1.5, VideoDegradation.MaintainFramerate))
    }

    @Test
    fun `a link that stays degraded freezes the video, and a recovered one thaws it at the current tier`() {
        var ladder = CallVideoEncodingLadder()
        ladder = ladder.at(0.0, VideoQualityLevel.POOR).ladder
        val frozen = ladder.at(6.0, VideoQualityLevel.POOR)
        assertThat(frozen.frozenChanged).isTrue()
        assertThat(frozen.ladder.budget).isEqualTo(CallVideoBudget.SURVIVAL_FLOOR)

        ladder = frozen.ladder.at(11.0, VideoQualityLevel.GOOD).ladder
        val thawed = ladder.at(21.0, VideoQualityLevel.GOOD)
        assertThat(thawed.frozenChanged).isTrue()
        assertThat(thawed.reapply).isTrue()
        assertThat(thawed.ladder.budget.maxBitrateBps).isEqualTo(1_500_000)
    }

    @Test
    fun `the camera turned off by the user thaws a frozen video`() {
        var ladder = CallVideoEncodingLadder().at(0.0, VideoQualityLevel.CRITICAL).ladder
        ladder = ladder.at(6.0, VideoQualityLevel.CRITICAL).ladder
        assertThat(ladder.isFrozen).isTrue()

        val off = ladder.at(7.0, VideoQualityLevel.CRITICAL, wantsVideo = false)
        assertThat(off.frozenChanged).isTrue()
        assertThat(off.ladder.isFrozen).isFalse()
    }
}
