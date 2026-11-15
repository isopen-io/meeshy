package me.meeshy.sdk.model.composer.timeline.engine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StorySourceWindowMs
import org.junit.Test

class TimelineAudioWindowTest {

    @Test
    fun `sans rognage et sans ecoule rien a fenetrer`() {
        assertThat(TimelineAudioWindow.segment(null, 0.0, 44_100.0, 441_000)).isNull()
    }

    @Test
    fun `sans rognage un ecoule positif entre en cours de fichier`() {
        assertThat(TimelineAudioWindow.segment(null, 2.0, 1000.0, 10_000)).isEqualTo(AudioSegment(2_000, 8_000))
    }

    @Test
    fun `un fichier invalide ou un taux invalide ne rend rien`() {
        assertThat(TimelineAudioWindow.segment(null, 1.0, 0.0, 10_000)).isNull()
        assertThat(TimelineAudioWindow.segment(null, 1.0, 1000.0, 0)).isNull()
        assertThat(TimelineAudioWindow.segment(null, Double.NaN, 1000.0, 10_000)).isNull()
    }

    @Test
    fun `une fenetre ouverte a droite va jusqu'a la fin du fichier`() {
        assertThat(TimelineAudioWindow.segment(StorySourceWindowMs(3_000, null), 0.0, 1000.0, 10_000))
            .isEqualTo(AudioSegment(3_000, 7_000))
    }

    @Test
    fun `une fin au dela du fichier est bornee a sa longueur`() {
        assertThat(TimelineAudioWindow.segment(StorySourceWindowMs(8_000, 99_000), 0.0, 1000.0, 10_000))
            .isEqualTo(AudioSegment(8_000, 2_000))
    }

    @Test
    fun `une fenetre inversee ne rend rien`() {
        assertThat(TimelineAudioWindow.segment(StorySourceWindowMs(5_000, 4_000), 0.0, 1000.0, 10_000)).isNull()
    }
}
