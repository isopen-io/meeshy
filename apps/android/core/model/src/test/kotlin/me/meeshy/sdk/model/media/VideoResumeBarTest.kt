package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyMediaConsumption
import org.junit.Test

class VideoResumeBarTest {

    @Test
    fun `sous 1 pour cent rien n'est dessiné`() {
        assertThat(VideoResumeBar.fraction(localFraction = 0.01, served = null, totalDurationSeconds = 100.0)).isNull()
        assertThat(VideoResumeBar.fraction(localFraction = 0.0, served = null, totalDurationSeconds = 100.0)).isNull()
        assertThat(VideoResumeBar.fraction(localFraction = null, served = null, totalDurationSeconds = 100.0)).isNull()
    }

    @Test
    fun `au dessus du seuil la fraction locale est servie telle quelle`() {
        assertThat(VideoResumeBar.fraction(0.4, null, 100.0)).isEqualTo(0.4)
        assertThat(VideoResumeBar.fraction(3.0, null, 100.0)).isEqualTo(1.0)
    }

    @Test
    fun `à défaut de local la consommation servie comble l'absence`() {
        val served = MeeshyMediaConsumption(lastWatchPositionMs = 80_000)
        assertThat(VideoResumeBar.fraction(null, served, 100.0)).isEqualTo(0.8)
    }

    @Test
    fun `le local garde la main même plus bas que le servi`() {
        val served = MeeshyMediaConsumption(lastWatchPositionMs = 80_000)
        assertThat(VideoResumeBar.fraction(0.0, served, 100.0)).isNull()
    }

    @Test
    fun `une vidéo terminée ailleurs remplit la barre, sans durée une position servie ne vaut rien`() {
        assertThat(VideoResumeBar.fraction(null, MeeshyMediaConsumption(watchedComplete = true), 0.0)).isEqualTo(1.0)
        assertThat(VideoResumeBar.fraction(null, MeeshyMediaConsumption(lastWatchPositionMs = 5_000), 0.0)).isNull()
    }
}
