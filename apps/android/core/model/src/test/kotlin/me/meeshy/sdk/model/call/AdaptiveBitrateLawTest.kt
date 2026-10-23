package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AdaptiveBitrateLawTest {
    @Test
    fun `lien excellent donne le débit maximal`() {
        assertThat(AdaptiveBitrateLaw.audioBitrateBps(100.0, 0.01, jitterCapped = false)).isEqualTo(128_000)
    }

    @Test
    fun `lien correct donne le débit par défaut, au-delà le plancher`() {
        assertThat(AdaptiveBitrateLaw.audioBitrateBps(250.0, 0.05, jitterCapped = false)).isEqualTo(64_000)
        assertThat(AdaptiveBitrateLaw.audioBitrateBps(251.0, 0.0, jitterCapped = false)).isEqualTo(24_000)
        assertThat(AdaptiveBitrateLaw.audioBitrateBps(50.0, 0.06, jitterCapped = false)).isEqualTo(24_000)
    }

    @Test
    fun `la gigue confirmée plafonne même sur un lien excellent`() {
        assertThat(AdaptiveBitrateLaw.audioBitrateBps(20.0, 0.0, jitterCapped = true)).isEqualTo(24_000)
    }

    @Test
    fun `l'estimation de bande passante ne contraint qu'avec vidéo et après la chauffe`() {
        val bad = 100_000
        val heuristic = VideoQualityLevel.EXCELLENT
        assertThat(AdaptiveBitrateLaw.effectiveLevel(heuristic, bad, isSendingVideo = false, secondsSinceMonitorStart = 60.0))
            .isEqualTo(heuristic)
        assertThat(AdaptiveBitrateLaw.effectiveLevel(heuristic, bad, isSendingVideo = true, secondsSinceMonitorStart = 29.9))
            .isEqualTo(heuristic)
        assertThat(AdaptiveBitrateLaw.effectiveLevel(heuristic, 0, isSendingVideo = true, secondsSinceMonitorStart = 60.0))
            .isEqualTo(heuristic)
        assertThat(AdaptiveBitrateLaw.effectiveLevel(heuristic, bad, isSendingVideo = true, secondsSinceMonitorStart = 30.0))
            .isEqualTo(VideoQualityLevel.CRITICAL)
    }

    @Test
    fun `l'estimation ne relève jamais l'heuristique`() {
        assertThat(
            AdaptiveBitrateLaw.effectiveLevel(VideoQualityLevel.POOR, 3_000_000, isSendingVideo = true, secondsSinceMonitorStart = 99.0),
        ).isEqualTo(VideoQualityLevel.POOR)
    }
}
