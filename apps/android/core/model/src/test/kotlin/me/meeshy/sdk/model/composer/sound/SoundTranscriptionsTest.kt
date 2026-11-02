package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.MobileTranscriptionSegment
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.OnDeviceTranscriptionSegment
import org.junit.Test

class SoundTranscriptionsTest {
    private fun track(id: String, postMediaId: String = "pm-$id") = StoryAudioPlayerObject(id = id, postMediaId = postMediaId)

    @Test
    fun `an on-device transcription travels as the payload iOS sends, segments in seconds`() {
        val heard = OnDeviceTranscription(
            text = "bom dia",
            language = "pt",
            confidence = 0.8,
            segments = listOf(OnDeviceTranscriptionSegment("bom dia", startMs = 1_500, durationMs = 2_000, confidence = 0.8)),
        )
        assertThat(SoundTranscriptions.payload(heard)).isEqualTo(
            MobileTranscriptionPayload(
                text = "bom dia",
                language = "pt",
                confidence = 0.8,
                segments = listOf(MobileTranscriptionSegment(text = "bom dia", start = 1.5, end = 3.5)),
            ),
        )
    }

    @Test
    fun `an empty recognition is no transcription`() {
        assertThat(SoundTranscriptions.payload(OnDeviceTranscription("  ", "fr", 0.0))).isNull()
    }

    @Test
    fun `a written transcription is trimmed, certain, and blank means none`() {
        assertThat(SoundTranscriptions.manual("  salut  ", "fr")).isEqualTo(MobileTranscriptionPayload(text = "salut", language = "fr", confidence = 1.0))
        assertThat(SoundTranscriptions.manual("   ", "fr")).isNull()
    }

    @Test
    fun `the published transcription is the one of the first sound the server keeps as audio`() {
        val audio = listOf(track("borrowed", postMediaId = ""), track("first"), track("second"))
        val texts = mapOf(
            "borrowed" to MobileTranscriptionPayload("x", "en"),
            "second" to MobileTranscriptionPayload("deux", "fr"),
        )
        assertThat(SoundTranscriptions.published(audio, texts)).isNull()
        val withFirst = texts + ("first" to MobileTranscriptionPayload("un", "fr"))
        assertThat(SoundTranscriptions.published(audio, withFirst)!!.text).isEqualTo("un")
    }

    @Test
    fun `a transcription follows its track and leaves with it`() {
        val texts = mapOf("a" to MobileTranscriptionPayload("a", "fr"), "gone" to MobileTranscriptionPayload("g", "fr"))
        assertThat(SoundTranscriptions.pruned(texts, listOf(track("a"))).keys).containsExactly("a")
    }

    @Test
    fun `what the author wrote is told apart from what the device heard`() {
        assertThat(SoundTranscriptions.isWritten(SoundTranscriptions.manual("salut", "fr")!!)).isTrue()
        val heard = OnDeviceTranscription(
            text = "salut",
            language = "fr",
            confidence = 1.0,
            segments = listOf(OnDeviceTranscriptionSegment("salut", startMs = 0, durationMs = 500, confidence = 1.0)),
        )
        assertThat(SoundTranscriptions.isWritten(SoundTranscriptions.payload(heard)!!)).isFalse()
        assertThat(SoundTranscriptions.isWritten(MobileTranscriptionPayload("x", "fr", confidence = 0.8))).isFalse()
    }
}
