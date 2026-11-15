package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaPermissionState
import org.junit.Test

class TranscriptionErrorTest {

    @Test
    fun `chaque cas porte le message typé de la version iOS`() {
        assertThat(TranscriptionError.PermissionDenied.message).isEqualTo("Speech recognition permission denied")
        assertThat(TranscriptionError.RecognizerUnavailable("fr").message)
            .isEqualTo("Speech recognizer unavailable for language: fr")
        assertThat(TranscriptionError.OnDeviceNotSupported("fr").message)
            .isEqualTo("On-device recognition not supported for language: fr")
        assertThat(TranscriptionError.RecognitionFailed(IllegalStateException("boom")).message)
            .isEqualTo("Recognition failed: boom")
        assertThat(TranscriptionError.AudioEngineFailed(IllegalStateException("mic")).message)
            .isEqualTo("Local audio capture failed: mic")
        assertThat(TranscriptionError.TapFormatUnavailable(0.0, 0).message)
            .isEqualTo("Microphone format unavailable: 0.0 Hz / 0 ch")
    }

    @Test
    fun `l'égalité se fait par message comme sur iOS`() {
        assertThat(TranscriptionError.RecognitionFailed(RuntimeException("x")))
            .isEqualTo(TranscriptionError.RecognitionFailed(IllegalStateException("x")))
        assertThat(TranscriptionError.RecognitionFailed(RuntimeException("x")))
            .isNotEqualTo(TranscriptionError.AudioEngineFailed(RuntimeException("x")))
    }

    @Test
    fun `les codes du reconnaisseur Android se projettent sur les cas typés`() {
        assertThat(TranscriptionError.fromRecognizerErrorCode(9, "fr")).isEqualTo(TranscriptionError.PermissionDenied)
        assertThat(TranscriptionError.fromRecognizerErrorCode(12, "fr"))
            .isEqualTo(TranscriptionError.OnDeviceNotSupported("fr"))
        assertThat(TranscriptionError.fromRecognizerErrorCode(13, "fr"))
            .isEqualTo(TranscriptionError.RecognizerUnavailable("fr"))
        assertThat(TranscriptionError.fromRecognizerErrorCode(3, "fr")).isInstanceOf(TranscriptionError.AudioEngineFailed::class.java)
        assertThat(TranscriptionError.fromRecognizerErrorCode(8, "fr")).isInstanceOf(TranscriptionError.RecognitionFailed::class.java)
    }

    @Test
    fun `aucune parole entendue n'est pas une erreur`() {
        assertThat(TranscriptionError.fromRecognizerErrorCode(7, "fr")).isNull()
        assertThat(TranscriptionError.fromRecognizerErrorCode(6, "fr")).isNull()
    }

    @Test
    fun `la permission se projette depuis RECORD_AUDIO`() {
        assertThat(TranscriptionPermission.fromRecordAudio(MediaPermissionState.NOT_DETERMINED))
            .isEqualTo(TranscriptionPermission.NOT_DETERMINED)
        assertThat(TranscriptionPermission.fromRecordAudio(MediaPermissionState.GRANTED))
            .isEqualTo(TranscriptionPermission.AUTHORIZED)
        assertThat(TranscriptionPermission.fromRecordAudio(MediaPermissionState.DENIED))
            .isEqualTo(TranscriptionPermission.DENIED)
        assertThat(TranscriptionPermission.fromRecordAudio(MediaPermissionState.RESTRICTED))
            .isEqualTo(TranscriptionPermission.RESTRICTED)
        assertThat(TranscriptionPermission.AUTHORIZED.isUsable).isTrue()
        assertThat(TranscriptionPermission.DENIED.isUsable).isFalse()
    }

    @Test
    fun `un format sans fréquence ou sans canal n'autorise pas la capture`() {
        assertThat(AudioInputFormatReadiness.mayStart(48_000.0, 1)).isTrue()
        assertThat(AudioInputFormatReadiness.mayStart(0.0, 1)).isFalse()
        assertThat(AudioInputFormatReadiness.mayStart(48_000.0, 0)).isFalse()
        assertThat(AudioInputFormatReadiness.mayStart(Double.NaN, 1)).isFalse()
        assertThat(AudioInputFormatReadiness.mayStart(Double.POSITIVE_INFINITY, 1)).isFalse()
    }
}
