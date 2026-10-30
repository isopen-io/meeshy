package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.lang.AttachmentTranscriptPrism
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.MessageTranscriptionFiche.State
import org.junit.Test

/** #13779 — la fiche Transcription : états, transcription complète, traductions, langue servie par le Prisme. */
class MessageTranscriptionFicheTest {

    private class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val englishVoice = ApiAttachmentTranscription(
        transcribedText = "The meeting is moved",
        language = "en",
        confidence = 0.934,
        durationMs = 12_400,
        speakerCount = 2,
    )

    private fun voice(
        transcription: ApiAttachmentTranscription? = englishVoice,
        translations: Map<String, ApiAttachmentTranslation>? = mapOf(
            "fr" to ApiAttachmentTranslation(transcription = "La réunion est déplacée", durationMs = 11_000, cloned = true),
            "es" to ApiAttachmentTranslation(transcription = "La reunión se mueve", durationMs = 10_000),
            "de" to ApiAttachmentTranslation(transcription = "  "),
        ),
    ) = ApiMessageAttachment(id = "a1", mimeType = "audio/m4a", originalName = "note.m4a", duration = 12_000, transcription = transcription, translations = translations)

    @Test
    fun `a message without sound or video has nothing to transcribe`() {
        val state = MessageTranscriptionFiche.of(listOf(ApiMessageAttachment(id = "p", mimeType = "image/png")), Prefs(), Request.IDLE)
        assertThat(state).isEqualTo(State.Unavailable)
    }

    @Test
    fun `an untranscribed voice note lists its media and offers to transcribe it, in each request state`() {
        Request.entries.forEach { request ->
            val state = MessageTranscriptionFiche.of(listOf(voice(transcription = null, translations = null)), Prefs(), request)
            assertThat(state).isEqualTo(
                State.Empty(
                    media = listOf(MessageTranscriptionFiche.Media("a1", "note.m4a", isVideo = false, durationSeconds = 12)),
                    transcribable = "a1",
                    request = request,
                ),
            )
        }
    }

    @Test
    fun `a video alone is listed but the server only transcribes a sound`() {
        val video = ApiMessageAttachment(id = "v", mimeType = "video/mp4", fileName = "clip.mp4")
        val state = MessageTranscriptionFiche.of(listOf(video), Prefs(), Request.IDLE) as State.Empty
        assertThat(state.media.single().isVideo).isTrue()
        assertThat(state.transcribable).isNull()
    }

    @Test
    fun `the full transcription carries language, confidence, duration and speakers`() {
        val state = MessageTranscriptionFiche.of(listOf(voice()), Prefs(systemLanguage = "fr"), Request.IDLE) as State.Ready
        assertThat(state.original).isEqualTo(
            MessageTranscriptionFiche.Original("The meeting is moved", "en", confidencePercent = 93, durationSeconds = 12, speakerCount = 2),
        )
    }

    @Test
    fun `the translation the prism serves comes first and is marked, blank ones are dropped`() {
        val state = MessageTranscriptionFiche.of(listOf(voice()), Prefs(systemLanguage = "fr"), Request.IDLE) as State.Ready
        assertThat(state.translations.map { it.language }).containsExactly("fr", "es").inOrder()
        assertThat(state.translations.first().isServed).isTrue()
        assertThat(state.translations.first().isCloned).isTrue()
        assertThat(state.translations.last().isServed).isFalse()
    }

    @Test
    fun `the prism descends the reader's languages in order, a lower rank serves when the first is missing`() {
        val served = AttachmentTranscriptPrism.served(
            englishVoice,
            mapOf("es" to ApiAttachmentTranslation(transcription = "La reunión se mueve")),
            Prefs(systemLanguage = "fr", regionalLanguage = "es"),
        )
        assertThat(served).isEqualTo(AttachmentTranscriptPrism.Served("La reunión se mueve", "es", isTranslated = true))
        val state = MessageTranscriptionFiche.of(listOf(voice()), Prefs(systemLanguage = "it", regionalLanguage = "es"), Request.IDLE) as State.Ready
        assertThat(state.translations.first { it.isServed }.language).isEqualTo("es")
    }

    @Test
    fun `a reader whose language is the original is served the original, no translation is marked`() {
        val state = MessageTranscriptionFiche.of(listOf(voice()), Prefs(systemLanguage = "en", regionalLanguage = "fr"), Request.IDLE) as State.Ready
        assertThat(state.translations.none { it.isServed }).isTrue()
        assertThat(AttachmentTranscriptPrism.served(englishVoice, null, Prefs(systemLanguage = "de")))
            .isEqualTo(AttachmentTranscriptPrism.Served("The meeting is moved", "en", isTranslated = false))
    }

    @Test
    fun `a transcription that already exists comes back with the request, a processing one does not`() {
        val json = Json { ignoreUnknownKeys = true }
        val completed = json.decodeFromString<MessageTranscriptionFiche.TranscribeOutcome>(
            """{"taskId":null,"status":"completed","transcription":{"text":"Hello","language":"en","confidence":0.9,"source":"whisper"}}""",
        )
        assertThat(completed.completed?.text).isEqualTo("Hello")
        val processing = json.decodeFromString<MessageTranscriptionFiche.TranscribeOutcome>(
            """{"taskId":"t1","status":"processing","transcription":null,"translatedAudios":[]}""",
        )
        assertThat(processing.completed).isNull()
    }

    private fun segmented(speakerCount: Int?, vararg segments: TranscriptionSegment) = voice(
        transcription = englishVoice.copy(speakerCount = speakerCount, segments = segments.toList()),
        translations = null,
    )

    private fun readyOf(attachment: ApiMessageAttachment) =
        MessageTranscriptionFiche.of(listOf(attachment), Prefs(), Request.IDLE) as State.Ready

    @Test
    fun `the words come in order, blank ones dropped, each speaker keeps the colour of its first appearance`() {
        val state = readyOf(
            segmented(
                2,
                TranscriptionSegment(" The ", speakerId = "s1"),
                TranscriptionSegment("meeting", speakerId = "s1"),
                TranscriptionSegment("   ", speakerId = "s9"),
                TranscriptionSegment("is", speakerId = "s2"),
                TranscriptionSegment("moved", speakerId = "s1"),
            ),
        )
        assertThat(state.original.segments).containsExactly(
            MessageTranscriptionFiche.Segment("The", "08D9D6"),
            MessageTranscriptionFiche.Segment("meeting", "08D9D6"),
            MessageTranscriptionFiche.Segment("is", "FF6B6B"),
            MessageTranscriptionFiche.Segment("moved", "08D9D6"),
        ).inOrder()
    }

    @Test
    fun `segments without a speaker share one colour, and the palette wraps after eight speakers`() {
        val speakers = (1..9).map { TranscriptionSegment("w$it", speakerId = "s$it") }
        val state = readyOf(segmented(9, TranscriptionSegment("a"), *speakers.toTypedArray(), TranscriptionSegment("b")))
        val colours = state.original.segments.map { it.speakerColorHex }
        assertThat(colours.first()).isEqualTo(colours.last())
        assertThat(colours.subList(0, 9).toSet()).hasSize(8)
        assertThat(colours[8]).isEqualTo(colours[0])
    }

    @Test
    fun `a single speaker shows the words untinted`() {
        listOf(null, 1).forEach { count ->
            val state = readyOf(segmented(count, TranscriptionSegment("Hello", speakerId = "s1"), TranscriptionSegment("world", speakerId = "s2")))
            assertThat(state.original.segments.map { it.text }).containsExactly("Hello", "world").inOrder()
            assertThat(state.original.segments.all { it.speakerColorHex == null }).isTrue()
        }
    }

    @Test
    fun `the served transcription brings its words and speakers to the fiche`() {
        val json = Json { ignoreUnknownKeys = true }
        val attachment = json.decodeFromString<ApiMessageAttachment>(
            """{"id":"a1","mimeType":"audio/m4a","transcription":{"text":"Hi there","language":"en","speakerCount":2,
            "segments":[{"text":"Hi","startMs":0,"endMs":400,"speakerId":"s0","voiceSimilarityScore":null},
            {"text":"there","startMs":400,"endMs":900,"speakerId":"s1","voiceSimilarityScore":0.8}]}}""",
        )
        assertThat(readyOf(attachment).original.segments).containsExactly(
            MessageTranscriptionFiche.Segment("Hi", "08D9D6"),
            MessageTranscriptionFiche.Segment("there", "FF6B6B"),
        ).inOrder()
    }
}
