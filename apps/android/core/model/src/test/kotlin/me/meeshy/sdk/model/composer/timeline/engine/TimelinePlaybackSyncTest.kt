package me.meeshy.sdk.model.composer.timeline.engine

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** L'ancre commune de l'aperçu : vidéo, audio et horloge des slides sans vidéo partent du MÊME instant hôte (#9702). */
class TimelinePlaybackSyncTest {

    private val second = 1_000_000_000L

    @Test
    fun `l'ancre est l'instant present plus la marge d'amorcage`() {
        val anchor = TimelinePlaybackSync.anchorNanos(nowNanos = 10 * second, leadSeconds = 0.05)
        assertThat(anchor).isEqualTo(10 * second + 50_000_000L)
    }

    @Test
    fun `la marge par defaut est de cinquante millisecondes`() {
        assertThat(TimelinePlaybackSync.anchorNanos(nowNanos = 0L)).isEqualTo(50_000_000L)
    }

    @Test
    fun `l'ancre sature au lieu de deborder`() {
        val anchor = TimelinePlaybackSync.anchorNanos(nowNanos = Long.MAX_VALUE - 10, leadSeconds = 1.0)
        assertThat(anchor).isEqualTo(Long.MAX_VALUE)
    }

    @Test
    fun `un clip a venir part a l'ancre plus son retard sur la tete`() {
        val start = TimelinePlaybackSync.clipStartNanos(anchorNanos = 5 * second, clipStartSeconds = 4.0, playheadSeconds = 1.5)
        assertThat(start).isEqualTo(5 * second + 2_500_000_000L)
    }

    @Test
    fun `un clip deja commence part a l'ancre`() {
        val start = TimelinePlaybackSync.clipStartNanos(anchorNanos = 5 * second, clipStartSeconds = 1.0, playheadSeconds = 3.0)
        assertThat(start).isEqualTo(5 * second)
    }

    @Test
    fun `un retard demesure sature`() {
        val start = TimelinePlaybackSync.clipStartNanos(anchorNanos = Long.MAX_VALUE - 1, clipStartSeconds = 1e12, playheadSeconds = 0.0)
        assertThat(start).isEqualTo(Long.MAX_VALUE)
    }

    @Test
    fun `un retard non fini ne planifie pas dans le passe`() {
        val start = TimelinePlaybackSync.clipStartNanos(anchorNanos = 7L, clipStartSeconds = Double.NaN, playheadSeconds = 0.0)
        assertThat(start).isEqualTo(7L)
    }

    @Test
    fun `l'horloge interne derive du temps ecoule depuis l'ancre`() {
        val head = TimelinePlaybackSync.internalClockPlayhead(origin = 2f, anchorSeconds = 10.0, nowSeconds = 10.5, duration = 8f)
        assertThat(head).isWithin(1e-4f).of(2.5f)
    }

    @Test
    fun `avant l'ancre la tete reste a l'origine`() {
        val head = TimelinePlaybackSync.internalClockPlayhead(origin = 2f, anchorSeconds = 10.0, nowSeconds = 9.0, duration = 8f)
        assertThat(head).isEqualTo(2f)
    }

    @Test
    fun `la tete ne depasse jamais la duree`() {
        val head = TimelinePlaybackSync.internalClockPlayhead(origin = 2f, anchorSeconds = 0.0, nowSeconds = 100.0, duration = 8f)
        assertThat(head).isEqualTo(8f)
    }

    @Test
    fun `un item pret part ancre, un item en echec part sans ancre, un item inconnu attend`() {
        assertThat(TimelinePlaybackSync.videoStart(VideoItemStatus.READY)).isEqualTo(VideoStart.ANCHORED)
        assertThat(TimelinePlaybackSync.videoStart(VideoItemStatus.FAILED)).isEqualTo(VideoStart.UNANCHORED)
        assertThat(TimelinePlaybackSync.videoStart(VideoItemStatus.UNKNOWN)).isEqualTo(VideoStart.AWAITING_READINESS)
        assertThat(TimelinePlaybackSync.videoStart(null)).isEqualTo(VideoStart.AWAITING_READINESS)
    }
}
