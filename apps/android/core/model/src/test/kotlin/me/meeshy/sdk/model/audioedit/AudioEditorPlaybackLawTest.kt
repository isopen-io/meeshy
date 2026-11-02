package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioEditorPlaybackLawTest {

    @Test
    fun `sans fenêtre la lecture repart d'où elle est`() {
        assertThat(AudioEditorPlaybackLaw.startPosition(3.0, null)).isEqualTo(3.0)
    }

    @Test
    fun `hors fenêtre ou au bout, la lecture repart du début de la fenêtre`() {
        val region = 2.0..8.0
        assertThat(AudioEditorPlaybackLaw.startPosition(1.0, region)).isEqualTo(2.0)
        assertThat(AudioEditorPlaybackLaw.startPosition(7.98, region)).isEqualTo(2.0)
        assertThat(AudioEditorPlaybackLaw.startPosition(9.0, region)).isEqualTo(2.0)
        assertThat(AudioEditorPlaybackLaw.startPosition(5.0, region)).isEqualTo(5.0)
    }

    @Test
    fun `la boucle rebondit à la fin de la fenêtre seulement`() {
        assertThat(AudioEditorPlaybackLaw.shouldLoop(8.0, 2.0..8.0)).isTrue()
        assertThat(AudioEditorPlaybackLaw.shouldLoop(7.9, 2.0..8.0)).isFalse()
        assertThat(AudioEditorPlaybackLaw.shouldLoop(99.0, null)).isFalse()
    }

    @Test
    fun `un saut reste dans la piste`() {
        assertThat(AudioEditorPlaybackLaw.skipped(2.0, -5.0, 10.0)).isEqualTo(0.0)
        assertThat(AudioEditorPlaybackLaw.skipped(8.0, 5.0, 10.0)).isEqualTo(10.0)
        assertThat(AudioEditorPlaybackLaw.skipped(4.0, 5.0, 0.0)).isEqualTo(0.0)
    }

    @Test
    fun `la progression est bornée et sûre sans durée`() {
        assertThat(AudioEditorPlaybackLaw.progress(5.0, 10.0)).isEqualTo(0.5)
        assertThat(AudioEditorPlaybackLaw.progress(50.0, 10.0)).isEqualTo(1.0)
        assertThat(AudioEditorPlaybackLaw.progress(5.0, 0.0)).isEqualTo(0.0)
    }
}
