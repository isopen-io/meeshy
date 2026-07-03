package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural tests for the pure connection-quality classification SSOT — the
 * Android port of iOS `VideoQualityLevel.from(rtt:packetLoss:)` /
 * `.from(availableOutgoingBitrateBps:)` and `CallManager.connectionQualityLabel`.
 *
 * The classifiers use STRICT `>` boundaries (a value exactly on a threshold
 * stays in the better tier), so the tests pin both sides of every boundary.
 */
class CallQualityTest {

    // --- VideoQualityLevel.from(rttMs, packetLoss) -------------------------

    @Test
    fun `a pristine link is excellent`() {
        assertThat(VideoQualityLevel.from(rttMs = 0.0, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.EXCELLENT)
    }

    @Test
    fun `rtt at the excellent boundary stays excellent`() {
        // excellentRTT = 100, strict '>' → exactly 100 is still excellent.
        assertThat(VideoQualityLevel.from(rttMs = 100.0, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.EXCELLENT)
    }

    @Test
    fun `rtt just past the excellent boundary drops to good`() {
        assertThat(VideoQualityLevel.from(rttMs = 100.1, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.GOOD)
    }

    @Test
    fun `packet loss just past the excellent boundary drops to good`() {
        // excellentPacketLoss = 0.01.
        assertThat(VideoQualityLevel.from(rttMs = 0.0, packetLoss = 0.011))
            .isEqualTo(VideoQualityLevel.GOOD)
    }

    @Test
    fun `rtt just past the fair boundary drops to fair`() {
        // videoFairRTT = 200.
        assertThat(VideoQualityLevel.from(rttMs = 201.0, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.FAIR)
    }

    @Test
    fun `packet loss just past the fair boundary drops to fair`() {
        // videoFairPacketLoss = 0.03.
        assertThat(VideoQualityLevel.from(rttMs = 0.0, packetLoss = 0.031))
            .isEqualTo(VideoQualityLevel.FAIR)
    }

    @Test
    fun `rtt just past the poor boundary drops to poor`() {
        // videoPoorRTT = 300.
        assertThat(VideoQualityLevel.from(rttMs = 301.0, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.POOR)
    }

    @Test
    fun `packet loss just past the good boundary drops to poor`() {
        // goodPacketLoss = 0.05.
        assertThat(VideoQualityLevel.from(rttMs = 0.0, packetLoss = 0.051))
            .isEqualTo(VideoQualityLevel.POOR)
    }

    @Test
    fun `rtt past the poor rtt ceiling is critical`() {
        // poorRTT = 500.
        assertThat(VideoQualityLevel.from(rttMs = 501.0, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.CRITICAL)
    }

    @Test
    fun `packet loss past the poor loss ceiling is critical`() {
        // poorPacketLoss = 0.10.
        assertThat(VideoQualityLevel.from(rttMs = 0.0, packetLoss = 0.11))
            .isEqualTo(VideoQualityLevel.CRITICAL)
    }

    @Test
    fun `the worse of rtt and loss wins`() {
        // Low rtt (excellent) but critical loss → critical.
        assertThat(VideoQualityLevel.from(rttMs = 10.0, packetLoss = 0.20))
            .isEqualTo(VideoQualityLevel.CRITICAL)
        // Critical rtt but zero loss → critical.
        assertThat(VideoQualityLevel.from(rttMs = 900.0, packetLoss = 0.0))
            .isEqualTo(VideoQualityLevel.CRITICAL)
    }

    // --- VideoQualityLevel.from(availableOutgoingBitrateBps) ---------------

    @Test
    fun `bwe at or above the excellent floor is excellent`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 2_000_000))
            .isEqualTo(VideoQualityLevel.EXCELLENT)
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 5_000_000))
            .isEqualTo(VideoQualityLevel.EXCELLENT)
    }

    @Test
    fun `bwe just below the excellent floor is good`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 1_999_999))
            .isEqualTo(VideoQualityLevel.GOOD)
    }

    @Test
    fun `bwe at the good floor is good`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 1_000_000))
            .isEqualTo(VideoQualityLevel.GOOD)
    }

    @Test
    fun `bwe at the fair floor is fair`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 400_000))
            .isEqualTo(VideoQualityLevel.FAIR)
    }

    @Test
    fun `bwe at the poor floor is poor`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 150_000))
            .isEqualTo(VideoQualityLevel.POOR)
    }

    @Test
    fun `bwe below the poor floor is critical`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 149_999))
            .isEqualTo(VideoQualityLevel.CRITICAL)
    }

    @Test
    fun `zero bwe is critical`() {
        assertThat(VideoQualityLevel.from(availableOutgoingBitrateBps = 0))
            .isEqualTo(VideoQualityLevel.CRITICAL)
    }

    // --- tier accessors + ordering -----------------------------------------

    @Test
    fun `tier target caps match the iOS ladder`() {
        assertThat(VideoQualityLevel.EXCELLENT.targetResolutionHeight).isEqualTo(720)
        assertThat(VideoQualityLevel.EXCELLENT.targetFps).isEqualTo(30)
        assertThat(VideoQualityLevel.EXCELLENT.targetVideoBitrateBps).isEqualTo(2_500_000)

        assertThat(VideoQualityLevel.GOOD.targetResolutionHeight).isEqualTo(720)
        assertThat(VideoQualityLevel.GOOD.targetFps).isEqualTo(24)
        assertThat(VideoQualityLevel.GOOD.targetVideoBitrateBps).isEqualTo(1_500_000)

        assertThat(VideoQualityLevel.FAIR.targetResolutionHeight).isEqualTo(480)
        assertThat(VideoQualityLevel.FAIR.targetFps).isEqualTo(20)
        assertThat(VideoQualityLevel.FAIR.targetVideoBitrateBps).isEqualTo(800_000)

        assertThat(VideoQualityLevel.POOR.targetResolutionHeight).isEqualTo(360)
        assertThat(VideoQualityLevel.POOR.targetFps).isEqualTo(15)
        assertThat(VideoQualityLevel.POOR.targetVideoBitrateBps).isEqualTo(400_000)

        assertThat(VideoQualityLevel.CRITICAL.targetResolutionHeight).isEqualTo(0)
        assertThat(VideoQualityLevel.CRITICAL.targetFps).isEqualTo(0)
        assertThat(VideoQualityLevel.CRITICAL.targetVideoBitrateBps).isEqualTo(0)
    }

    @Test
    fun `levels order from critical up to excellent`() {
        assertThat(VideoQualityLevel.CRITICAL).isLessThan(VideoQualityLevel.POOR)
        assertThat(VideoQualityLevel.POOR).isLessThan(VideoQualityLevel.FAIR)
        assertThat(VideoQualityLevel.FAIR).isLessThan(VideoQualityLevel.GOOD)
        assertThat(VideoQualityLevel.GOOD).isLessThan(VideoQualityLevel.EXCELLENT)
    }

    @Test
    fun `a sample classifies through the rtt-and-loss ladder`() {
        assertThat(CallQualitySample(rttMs = 50.0, packetLoss = 0.0).level())
            .isEqualTo(VideoQualityLevel.EXCELLENT)
        assertThat(CallQualitySample(rttMs = 250.0, packetLoss = 0.0).level())
            .isEqualTo(VideoQualityLevel.FAIR)
    }

    // --- ConnectionQuality indicator collapse ------------------------------

    @Test
    fun `the indicator collapses the five tiers onto four`() {
        assertThat(ConnectionQuality.from(VideoQualityLevel.EXCELLENT))
            .isEqualTo(ConnectionQuality.EXCELLENT)
        assertThat(ConnectionQuality.from(VideoQualityLevel.GOOD))
            .isEqualTo(ConnectionQuality.GOOD)
        assertThat(ConnectionQuality.from(VideoQualityLevel.FAIR))
            .isEqualTo(ConnectionQuality.FAIR)
        // critical collapses into poor — parity with connectionQualityLabel.
        assertThat(ConnectionQuality.from(VideoQualityLevel.POOR))
            .isEqualTo(ConnectionQuality.POOR)
        assertThat(ConnectionQuality.from(VideoQualityLevel.CRITICAL))
            .isEqualTo(ConnectionQuality.POOR)
    }

    @Test
    fun `the indicator exposes a 1-to-4 bar count`() {
        assertThat(ConnectionQuality.EXCELLENT.bars).isEqualTo(4)
        assertThat(ConnectionQuality.GOOD.bars).isEqualTo(3)
        assertThat(ConnectionQuality.FAIR.bars).isEqualTo(2)
        assertThat(ConnectionQuality.POOR.bars).isEqualTo(1)
    }

    @Test
    fun `only the poor tier reads as a weak link`() {
        assertThat(ConnectionQuality.POOR.isWeak).isTrue()
        assertThat(ConnectionQuality.FAIR.isWeak).isFalse()
        assertThat(ConnectionQuality.GOOD.isWeak).isFalse()
        assertThat(ConnectionQuality.EXCELLENT.isWeak).isFalse()
    }
}
