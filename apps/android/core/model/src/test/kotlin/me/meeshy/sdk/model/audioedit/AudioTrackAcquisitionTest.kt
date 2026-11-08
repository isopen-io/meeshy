package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTrackAcquisitionTest {

    private fun section(
        acquisition: AudioTrackAcquisition = AudioTrackAcquisition.DIRECT,
        hasLocalTrack: Boolean = true,
        duration: Double = 12.0,
    ) = AudioTrimSection.resolve(acquisition, hasLocalTrack, duration)

    @Test
    fun `sans piste locale la zone de rognage n'existe pas`() {
        assertThat(section(hasLocalTrack = false)).isEqualTo(AudioTrimSection.HIDDEN)
    }

    @Test
    fun `une piste locale de durée nulle ne se rogne pas`() {
        assertThat(section(duration = 0.0)).isEqualTo(AudioTrimSection.HIDDEN)
    }

    @Test
    fun `une piste locale qui dure monte les poignées`() {
        assertThat(section()).isEqualTo(AudioTrimSection.TRIMMER)
    }

    @Test
    fun `le rapatriement en cours se montre même sans fichier`() {
        assertThat(section(AudioTrackAcquisition.LOADING, hasLocalTrack = false)).isEqualTo(AudioTrimSection.LOADING)
    }

    @Test
    fun `l'échec du rapatriement se dit même sans fichier`() {
        assertThat(section(AudioTrackAcquisition.FAILED, hasLocalTrack = false)).isEqualTo(AudioTrimSection.FAILED)
    }

    @Test
    fun `l'attente prime sur un fichier local périmé`() {
        assertThat(section(AudioTrackAcquisition.LOADING, hasLocalTrack = true, duration = 30.0)).isEqualTo(AudioTrimSection.LOADING)
    }

    @Test
    fun `l'échec prime sur un fichier local périmé`() {
        assertThat(section(AudioTrackAcquisition.FAILED, hasLocalTrack = true, duration = 30.0)).isEqualTo(AudioTrimSection.FAILED)
    }
}
