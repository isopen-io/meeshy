package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoicePlaybackPresentationTest {

    private fun presentation(position: Long = 20_000L, duration: Long = 60_000L, rate: Double = 2.0) =
        VoicePlaybackPresentation("m", "c", "t", "s", "AM", "6366F1", true, position, duration, rate, 1_000_000L, "FR", true, 0)

    @Test
    fun `the bar projects from its anchor at the playback rate`() {
        val p = presentation()
        assertThat(p.intervalStartEpochMs).isEqualTo(1_000_000L - 10_000L)
        assertThat(p.intervalEndEpochMs).isEqualTo(1_000_000L + 20_000L)
        assertThat(p.fraction).isWithin(0.0001).of(20.0 / 60.0)
    }

    @Test
    fun `a zero duration gives an empty bar and a non negative interval`() {
        val p = presentation(position = 0L, duration = 0L)
        assertThat(p.fraction).isEqualTo(0.0)
        assertThat(p.intervalEndEpochMs).isAtLeast(p.intervalStartEpochMs)
    }

    @Test
    fun `a non positive rate projects at normal speed`() {
        assertThat(presentation(rate = 0.0).intervalStartEpochMs).isEqualTo(1_000_000L - 20_000L)
    }
}
