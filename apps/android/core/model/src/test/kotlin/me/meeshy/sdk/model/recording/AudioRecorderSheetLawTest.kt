package me.meeshy.sdk.model.recording

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioRecorderSheetLawTest {
    @Test
    fun `les puces n'existent que pour les portes fournies`() {
        assertThat(AudioRecorderSheetLaw.sources(false, hasFiles = true, hasLibrary = true))
            .containsExactly(RecorderSource.FILES, RecorderSource.LIBRARY).inOrder()
        assertThat(AudioRecorderSheetLaw.sources(false, hasFiles = false, hasLibrary = true))
            .containsExactly(RecorderSource.LIBRARY)
        assertThat(AudioRecorderSheetLaw.sources(false, hasFiles = false, hasLibrary = false)).isEmpty()
    }

    @Test
    fun `les puces sont masquees pendant la prise`() {
        assertThat(AudioRecorderSheetLaw.sources(true, hasFiles = true, hasLibrary = true)).isEmpty()
    }

    @Test
    fun `la fente de contenu est masquee pendant la prise`() {
        assertThat(AudioRecorderSheetLaw.showsAccessory(isRecording = true, hasAccessory = true)).isFalse()
        assertThat(AudioRecorderSheetLaw.showsAccessory(isRecording = false, hasAccessory = true)).isTrue()
        assertThat(AudioRecorderSheetLaw.showsAccessory(isRecording = false, hasAccessory = false)).isFalse()
    }

    @Test
    fun `sans plafond le temps ecoule est seul`() {
        assertThat(AudioRecorderSheetLaw.elapsedLabel(12.4, null)).isEqualTo("0:12")
    }

    @Test
    fun `avec un plafond le temps s'affiche ecoule sur plafond`() {
        assertThat(AudioRecorderSheetLaw.elapsedLabel(12.4, 60.0)).isEqualTo("0:12 / 1:00")
        assertThat(AudioRecorderSheetLaw.capReached(60.0, 60.0)).isTrue()
        assertThat(AudioRecorderSheetLaw.capReached(1_000.0, null)).isFalse()
    }

    @Test
    fun `une prise de moins d'une demi-seconde n'est pas remise`() {
        assertThat(AudioRecorderSheetLaw.delivers(0.5)).isFalse()
        assertThat(AudioRecorderSheetLaw.delivers(0.6)).isTrue()
    }
}
