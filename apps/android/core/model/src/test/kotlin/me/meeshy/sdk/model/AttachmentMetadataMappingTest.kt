package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentMetadataMappingTest {

    @Test
    fun `a bare track gets the exact defaults`() {
        val track = AttachmentMetadataMapping.translatedAudio("att1", "fr", ApiAttachmentTranslation(url = "https://cdn/a.mp3"))!!

        assertThat(track.id).isEqualTo("att1_fr")
        assertThat(track.attachmentId).isEqualTo("att1")
        assertThat(track.targetLanguage).isEqualTo("fr")
        assertThat(track.url).isEqualTo("https://cdn/a.mp3")
        assertThat(track.transcription).isEqualTo("")
        assertThat(track.durationMs).isEqualTo(0)
        assertThat(track.format).isEqualTo("mp3")
        assertThat(track.cloned).isFalse()
        assertThat(track.quality).isEqualTo(0.0)
        assertThat(track.voiceModelId).isNull()
        assertThat(track.ttsModel).isEqualTo("xtts")
        assertThat(track.segments).isEmpty()
    }

    @Test
    fun `a complete track keeps its served values`() {
        val served = ApiAttachmentTranslation(
            transcription = "bonjour",
            url = "https://cdn/b.wav",
            durationMs = 4_200,
            format = "wav",
            cloned = true,
            quality = 0.8,
            voiceModelId = "v1",
            ttsModel = "chatterbox",
            segments = listOf(TranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 1.2, speakerId = "s1")),
        )

        val track = AttachmentMetadataMapping.translatedAudio("att1", "fr", served)!!

        assertThat(track.transcription).isEqualTo("bonjour")
        assertThat(track.durationMs).isEqualTo(4_200)
        assertThat(track.format).isEqualTo("wav")
        assertThat(track.cloned).isTrue()
        assertThat(track.quality).isEqualTo(0.8)
        assertThat(track.voiceModelId).isEqualTo("v1")
        assertThat(track.ttsModel).isEqualTo("chatterbox")
        assertThat(track.segments).containsExactly(
            MessageTranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 1.2, speakerId = "s1"),
        )
    }

    @Test
    fun `a track without playable url is dropped`() {
        assertThat(AttachmentMetadataMapping.translatedAudio("att1", "fr", ApiAttachmentTranslation(url = "  "))).isNull()
        assertThat(AttachmentMetadataMapping.translatedAudio("att1", "fr", ApiAttachmentTranslation(url = null))).isNull()
    }

    @Test
    fun `the url is resolved by the caller`() {
        val track = AttachmentMetadataMapping.translatedAudio(
            "att1",
            "fr",
            ApiAttachmentTranslation(url = "/files/a.mp3"),
            resolveUrl = { "https://gate$it" },
        )!!

        assertThat(track.url).isEqualTo("https://gate/files/a.mp3")
    }

    @Test
    fun `a segment keeps text, bounds and speaker in seconds`() {
        val segment = AttachmentMetadataMapping.segment(
            TranscriptionSegment(text = "ok", startTime = 1.5, endTime = 2.0, speakerId = "s2"),
        )

        assertThat(segment).isEqualTo(MessageTranscriptionSegment(text = "ok", startTime = 1.5, endTime = 2.0, speakerId = "s2"))
    }

    @Test
    fun `a served millisecond segment decodes then maps in seconds`() {
        val decoded = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString<TranscriptionSegment>(
            """{"text":"hi","startMs":1500,"endMs":2000,"speakerId":"s1"}""",
        )

        val segment = AttachmentMetadataMapping.segment(decoded)

        assertThat(segment.startTime).isEqualTo(1.5)
        assertThat(segment.endTime).isEqualTo(2.0)
    }
}
