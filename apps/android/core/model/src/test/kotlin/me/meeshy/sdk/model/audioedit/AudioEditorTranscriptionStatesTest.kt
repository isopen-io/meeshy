package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioEditorTranscriptionStatesTest {

    @Test
    fun `au repos on peut lancer et rien ne s'affiche`() {
        val state = AudioTranscriptionState.Idle
        assertThat(state.canStart).isTrue()
        assertThat(state.isRunning).isFalse()
        assertThat(state.offersRetry).isFalse()
    }

    @Test
    fun `pendant la reconnaissance on ne peut pas relancer`() {
        val state = AudioTranscriptionState.Running
        assertThat(state.isRunning).isTrue()
        assertThat(state.canStart).isFalse()
    }

    @Test
    fun `un texte obtenu propose de recommencer et porte sa langue`() {
        val state = AudioTranscriptionState.Done(text = "bonjour", language = "fr")
        assertThat(state.offersRetry).isTrue()
        assertThat(state.canStart).isTrue()
        assertThat(state.exported()).isEqualTo(AudioEditTranscription(language = "fr", text = "bonjour"))
    }

    @Test
    fun `seul un texte obtenu et non vide part avec l'export`() {
        assertThat(AudioTranscriptionState.Done("  ", "fr").exported()).isNull()
        listOf(
            AudioTranscriptionState.Idle,
            AudioTranscriptionState.Running,
            AudioTranscriptionState.Failed(AudioTranscriptionFailure.NO_SPEECH),
            AudioTranscriptionState.PermissionDenied,
        ).forEach { assertThat(it.exported()).isNull() }
    }

    @Test
    fun `un échec et un refus de permission proposent de recommencer`() {
        assertThat(AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED).offersRetry).isTrue()
        assertThat(AudioTranscriptionState.PermissionDenied.offersRetry).isTrue()
        assertThat(AudioTranscriptionState.Failed(AudioTranscriptionFailure.FILE_MISSING).canStart).isTrue()
    }

    @Test
    fun `les quatre raisons d'échec de l'éditeur existent`() {
        assertThat(AudioTranscriptionFailure.entries.map { it.name })
            .containsExactly("FILE_MISSING", "EMPTY", "NO_SPEECH", "FAILED")
    }

    @Test
    fun `la langue par défaut est celle de l'appareil si elle se transcrit, l'anglais sinon`() {
        assertThat(AudioTranscriptionLanguages.defaultFor("FR")).isEqualTo("fr")
        assertThat(AudioTranscriptionLanguages.defaultFor("ja")).isEqualTo("en")
        assertThat(AudioTranscriptionLanguages.defaultFor(null)).isEqualTo("en")
    }
}
