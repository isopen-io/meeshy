package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPlaybackClockTest {

    private fun running(durationMs: Long = 10_000, failsafe: Long = 0) =
        StoryPlaybackClock(failsafe).apply { startSlide(durationMs); markContentReady() }

    @Test
    fun `la barre attend que le fond soit utilisable`() {
        val clock = StoryPlaybackClock(contentReadyFailsafeMs = 0).apply { startSlide(10_000) }

        assertThat(clock.advance(5_000).progress).isEqualTo(0f)

        clock.markContentReady()
        assertThat(clock.advance(5_000).progress).isEqualTo(0.5f)
    }

    @Test
    fun `le garde-fou active une slide dont le fond ne dit jamais qu'il est prêt`() {
        val clock = StoryPlaybackClock(contentReadyFailsafeMs = 6_000).apply { startSlide(10_000) }

        clock.advance(5_999)
        assertThat(clock.isActive).isFalse()
        clock.advance(1)
        assertThat(clock.isActive).isTrue()
    }

    @Test
    fun `la pause fige sans perdre la position et la reprise ne saute pas`() {
        val clock = running()
        clock.advance(4_000)

        clock.setPaused(true)
        assertThat(clock.advance(60_000).progress).isEqualTo(0.4f)

        clock.setPaused(false)
        assertThat(clock.advance(1_000).progress).isEqualTo(0.5f)
    }

    @Test
    fun `un média qui bufferise ou une interruption figent la barre`() {
        val clock = running()
        clock.advance(2_000)

        clock.setStalled(true)
        assertThat(clock.advance(9_000).progress).isEqualTo(0.2f)
        clock.setStalled(false)
        clock.setInterrupted(true)
        assertThat(clock.advance(9_000).progress).isEqualTo(0.2f)
        clock.setInterrupted(false)
        assertThat(clock.advance(1_000).progress).isEqualTo(0.3f)
    }

    @Test
    fun `la fin n'est annoncée qu'une fois`() {
        val clock = running(durationMs = 1_000)

        assertThat(clock.advance(1_500)).isEqualTo(StoryPlaybackClock.Tick(1f, completed = true))
        assertThat(clock.advance(500).completed).isFalse()
    }

    @Test
    fun `le seek à zéro après la fin réarme la boucle`() {
        val clock = running(durationMs = 1_000)
        clock.advance(1_000)

        assertThat(clock.seekToFraction(0f)).isEqualTo(StoryPlaybackClock.Tick(0f, completed = false))
        assertThat(clock.advance(1_000).completed).isTrue()
    }

    @Test
    fun `le seek reprend à la fraction demandée sans pause perdue`() {
        val clock = running()
        clock.setPaused(true)

        clock.seekToFraction(0.75f)
        assertThat(clock.progress).isEqualTo(0.75f)
        assertThat(clock.isPaused).isTrue()
        clock.setPaused(false)
        assertThat(clock.advance(1_000).progress).isEqualTo(0.85f)
    }

    @Test
    fun `pointer la fin déclenche la fin une seule fois et une fraction invalide retombe à zéro`() {
        val clock = running()

        assertThat(clock.seekToFraction(2f).completed).isTrue()
        assertThat(clock.seekToFraction(1f).completed).isFalse()
        assertThat(clock.seekToFraction(Float.NaN).progress).isEqualTo(0f)
    }

    @Test
    fun `une nouvelle slide repart de zéro en attente et dégelée`() {
        val clock = running()
        clock.advance(5_000)
        clock.setPaused(true)
        clock.setStalled(true)

        clock.startSlide(4_000)

        assertThat(clock.progress).isEqualTo(0f)
        assertThat(clock.isActive).isFalse()
        assertThat(clock.isPaused).isFalse()
        assertThat(clock.isStalled).isFalse()
    }

    @Test
    fun `une durée qui change garde la fraction jouée`() {
        val clock = running(durationMs = 10_000)
        clock.advance(5_000)

        clock.updateDuration(20_000)

        assertThat(clock.progress).isEqualTo(0.5f)
        assertThat(clock.advance(2_000).progress).isEqualTo(0.6f)
    }
}
