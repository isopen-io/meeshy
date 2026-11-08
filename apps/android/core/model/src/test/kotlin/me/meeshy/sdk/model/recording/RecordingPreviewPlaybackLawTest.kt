package me.meeshy.sdk.model.recording

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.AudioPlaybackState
import org.junit.Test

class RecordingPreviewPlaybackLawTest {
    private val id = "recorder-preview"

    @Test
    fun `le premier appui charge la prise dans le moteur`() {
        assertThat(RecordingPreviewPlaybackLaw.command(AudioPlaybackState(), id)).isEqualTo(PreviewPlayCommand.LOAD_AND_PLAY)
        assertThat(RecordingPreviewPlaybackLaw.command(AudioPlaybackState(attachmentId = "autre"), id))
            .isEqualTo(PreviewPlayCommand.LOAD_AND_PLAY)
    }

    @Test
    fun `une fois chargee, l'appui bascule lecture et pause`() {
        assertThat(RecordingPreviewPlaybackLaw.command(AudioPlaybackState(attachmentId = id), id)).isEqualTo(PreviewPlayCommand.TOGGLE)
    }

    @Test
    fun `l'apercu parait au repos tant que le moteur porte un autre vocal`() {
        val view = RecordingPreviewPlaybackLaw.view(AudioPlaybackState(attachmentId = "autre", isPlaying = true, currentTimeMs = 4_000, durationMs = 8_000), id, 5.0)
        assertThat(view.isPlaying).isFalse()
        assertThat(view.fraction).isEqualTo(0.0)
        assertThat(view.durationSeconds).isEqualTo(5.0)
    }

    @Test
    fun `la lecture de la prise se projette depuis le moteur`() {
        val view = RecordingPreviewPlaybackLaw.view(AudioPlaybackState(attachmentId = id, isPlaying = true, currentTimeMs = 2_000, durationMs = 8_000), id, 5.0)
        assertThat(view.isPlaying).isTrue()
        assertThat(view.fraction).isEqualTo(0.25)
        assertThat(view.elapsedSeconds).isEqualTo(2.0)
        assertThat(view.durationSeconds).isEqualTo(8.0)
    }

    @Test
    fun `sans duree du moteur, la duree enregistree sert`() {
        val view = RecordingPreviewPlaybackLaw.view(AudioPlaybackState(attachmentId = id, isLoading = true), id, 5.0)
        assertThat(view.isLoading).isTrue()
        assertThat(view.durationSeconds).isEqualTo(5.0)
    }
}
