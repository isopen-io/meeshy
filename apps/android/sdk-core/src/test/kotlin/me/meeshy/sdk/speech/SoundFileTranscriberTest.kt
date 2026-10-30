package me.meeshy.sdk.speech

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import org.junit.Test

class SoundFileTranscriberTest {
    private val rate = 16_000

    /** Une seconde de silence, une seconde et demie de voix, une seconde et demie de silence, une seconde de voix. */
    private fun spokenTwice(): ByteArray {
        fun run(seconds: Double, amplitude: Int) = ByteArray((rate * seconds).toInt() * 2) { i ->
            val sample = if (i % 4 < 2) amplitude else -amplitude
            (if (i % 2 == 0) sample and 0xFF else (sample shr 8) and 0xFF).toByte()
        }
        return run(1.0, 0) + run(1.5, 12_000) + run(1.5, 0) + run(1.0, 12_000)
    }

    private fun transcriber(
        decoded: DecodedSpeech? = DecodedSpeech(spokenTwice(), rate),
        resolution: SpeechLanguageResolution = SpeechLanguageResolution.Available("pt-BR"),
        recognize: suspend (ByteArray, Int, String) -> HeardText = { _, _, _ -> HeardText("olá", 0.9) },
    ) = SoundFileTranscriber(
        decode = { decoded },
        resolveLanguage = { resolution },
        recognize = recognize,
    )

    @Test
    fun `each spoken span is recognized on the device and the sound gets one timed text`() = runTest {
        val tags = mutableListOf<String>()
        val outcome = transcriber(recognize = { _, _, tag -> tags += tag; HeardText("olá", 0.9) }).transcribe("/rec.m4a", "pt")
        val heard = (outcome as SoundTranscriptionOutcome.Heard).transcription
        assertThat(heard.text).isEqualTo("olá olá")
        assertThat(heard.language).isEqualTo("pt")
        assertThat(heard.segments).hasSize(2)
        assertThat(tags).containsExactly("pt-BR", "pt-BR")
    }

    @Test
    fun `a device or a language without on-device recognition leaves the sound to the server`() = runTest {
        assertThat(transcriber(resolution = SpeechLanguageResolution.ServerFallback).transcribe("/rec.m4a", "pt"))
            .isEqualTo(SoundTranscriptionOutcome.ServerWillTranscribe)
        assertThat(transcriber(resolution = SpeechLanguageResolution.NotInstalled).transcribe("/rec.m4a", "pt"))
            .isEqualTo(SoundTranscriptionOutcome.ServerWillTranscribe)
        val refused = transcriber(recognize = { _, _, _ -> throw TranscriptionException(TranscriptionError.OnDeviceNotSupported("pt")) })
        assertThat(refused.transcribe("/rec.m4a", "pt")).isEqualTo(SoundTranscriptionOutcome.ServerWillTranscribe)
    }

    @Test
    fun `an unreadable file or a recognizer that fails says the transcription failed`() = runTest {
        assertThat(transcriber(decoded = null).transcribe("/rec.m4a", "pt")).isEqualTo(SoundTranscriptionOutcome.Failed)
        val failing = transcriber(recognize = { _, _, _ -> throw TranscriptionException(TranscriptionError.RecognitionFailed(IllegalStateException("x"))) })
        assertThat(failing.transcribe("/rec.m4a", "pt")).isEqualTo(SoundTranscriptionOutcome.Failed)
    }

    @Test
    fun `a silent sound is heard as nothing, never as a failure`() = runTest {
        val outcome = transcriber(decoded = DecodedSpeech(ByteArray(rate * 2), rate)).transcribe("/rec.m4a", "pt")
        assertThat((outcome as SoundTranscriptionOutcome.Heard).transcription.text).isEmpty()
    }
}
