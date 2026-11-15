package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.MediaResumeMerge
import me.meeshy.sdk.model.playback.MediaResumeMerge.Medium
import me.meeshy.sdk.model.playback.MediaResumeMerge.StampedPosition
import org.junit.Test

class MediaResumeMergeTest {

    private val served = MeeshyMediaConsumption(lastPlayPositionMs = 20_000, lastWatchPositionMs = 5_000)

    @Test
    fun `la position la plus recente gagne`() {
        val local = StampedPosition(10_000L, savedAtEpochMs = 100L)
        val remote = StampedPosition(30_000L, savedAtEpochMs = 200L)

        assertThat(MediaResumeMerge.newest(local, remote)).isEqualTo(remote)
        assertThat(MediaResumeMerge.newest(remote, local)).isEqualTo(remote)
    }

    @Test
    fun `a egalite d'instant le premier garde la main, et une absence ne gagne jamais`() {
        val a = StampedPosition(1L, 5L)
        val b = StampedPosition(2L, 5L)

        assertThat(MediaResumeMerge.newest(a, b)).isEqualTo(a)
        assertThat(MediaResumeMerge.newest(null, b)).isEqualTo(b)
        assertThat(MediaResumeMerge.newest(a, null)).isEqualTo(a)
        assertThat(MediaResumeMerge.newest(null, null)).isNull()
    }

    @Test
    fun `le local gagne meme hors zone, le serveur ne comble que l'absence`() {
        assertThat(MediaResumeMerge.resumePositionMs(500L, served, Medium.Audio, 60_000L)).isNull()
        assertThat(MediaResumeMerge.resumePositionMs(9_000L, served, Medium.Audio, 60_000L)).isEqualTo(9_000L)
        assertThat(MediaResumeMerge.resumePositionMs(null, served, Medium.Audio, 60_000L)).isEqualTo(20_000L)
    }

    @Test
    fun `chaque medium lit sa propre paire de champs`() {
        assertThat(MediaResumeMerge.resumePositionMs(null, served, Medium.Video, 60_000L)).isEqualTo(5_000L)
    }

    @Test
    fun `un media termine ailleurs n'offre pas de reprise`() {
        val done = served.copy(listenedComplete = true)

        assertThat(MediaResumeMerge.resumePositionMs(null, done, Medium.Audio, 60_000L)).isNull()
        assertThat(MediaResumeMerge.restingFraction(null, done, Medium.Audio, 60_000L)).isEqualTo(1.0)
    }

    @Test
    fun `la fraction au repos prefere le local, y compris zero`() {
        assertThat(MediaResumeMerge.restingFraction(0.0, served, Medium.Audio, 40_000L)).isEqualTo(0.0)
        assertThat(MediaResumeMerge.restingFraction(null, served, Medium.Audio, 40_000L)).isEqualTo(0.5)
        assertThat(MediaResumeMerge.restingFraction(null, null, Medium.Audio, 40_000L)).isEqualTo(0.0)
        assertThat(MediaResumeMerge.restingFraction(null, served, Medium.Audio, 10_000L)).isEqualTo(1.0)
    }

    @Test
    fun `une consommation detenue pour une autre piece jointe est ignoree`() {
        assertThat(MediaResumeMerge.heldConsumption("a", served, matching = "a")).isEqualTo(served)
        assertThat(MediaResumeMerge.heldConsumption("a", served, matching = "b")).isNull()
        assertThat(MediaResumeMerge.heldConsumption(null, served, matching = "b")).isNull()
    }
}
