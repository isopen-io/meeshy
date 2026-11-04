package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.TranscriptionSegment
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * La transcription d'un vocal arrive de trois côtés (page REST, trame socket, ligne locale) et le résultat ne dépend
 * pas de l'ordre : une trame plus récente qu'une page ne l'est pas effacée, une page qui re-transcrit l'emporte sur la
 * ligne périmée, et les segments voyagent avec le texte.
 */
@RunWith(RobolectricTestRunner::class)
class MessageTranscriptionArrivalTest {

    private val hello = listOf(
        TranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 1.0, speakerId = "s1"),
        TranscriptionSegment(text = "a tous", startTime = 1.0, endTime = 2.0, speakerId = "s2"),
    )

    private fun voice(transcription: ApiAttachmentTranscription? = null, translations: Map<String, ApiAttachmentTranslation>? = null) =
        ApiMessageAttachment(id = "a1", mimeType = "audio/m4a", fileUrl = "https://cdn/a1.m4a", transcription = transcription, translations = translations)

    private fun message(vararg attachments: ApiMessageAttachment) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "u1",
        messageType = "audio",
        originalLanguage = "fr",
        createdAt = "2026-06-01T10:00:00Z",
        attachments = attachments.toList(),
    )

    private fun writer(harness: MessageCollaboratorHarness) =
        MessageEnrichmentWriter(harness.updater, NoTranslator(), TranslationLayer.of(harness.database), harness.clock)

    private suspend fun MessageCollaboratorHarness.shown(): ApiMessage {
        val layer = TranslationLayer.of(database)
        val stored = cachedMessage("m1")
        layer.ensureLoaded(listOf(stored.id))
        return layer.project(LocalMessage(stored)).message
    }

    @Test
    fun `la transcription socket garde ses segments et ses locuteurs`() = runHarnessTest { harness ->
        harness.seedSynced(message(voice()))

        writer(harness).applyTranscription("m1", "a1", "bonjour a tous", "fr", 0.9, 2000L, segments = hello, speakerCount = 2)

        val transcription = harness.shown().attachments.single().transcription!!
        assertThat(transcription.text).isEqualTo("bonjour a tous")
        assertThat(transcription.segments).isEqualTo(hello)
        assertThat(transcription.speakerCount).isEqualTo(2)
    }

    @Test
    fun `une transcription sans segments ne touche pas la charge du message`() = runHarnessTest { harness ->
        harness.seedSynced(message(voice()))
        val before = harness.database.messageDao().find("m1")!!.payload

        writer(harness).applyTranscription("m1", "a1", "bonjour a tous", "fr", 0.9, 2000L)

        assertThat(harness.database.messageDao().find("m1")!!.payload).isEqualTo(before)
    }

    @Test
    fun `une page REST qui re-transcrit l'emporte sur la ligne periodee`() = runHarnessTest { harness ->
        harness.seedSynced(message(voice()))
        writer(harness).applyTranscription("m1", "a1", "vieux texte", "fr", null, null)

        MessageIngestPipeline(harness.database).ingest(
            listOf(message(voice(ApiAttachmentTranscription(text = "nouveau texte", language = "fr")))),
            harness.clock.now + 1_000,
        )

        assertThat(harness.shown().attachments.single().transcription?.text).isEqualTo("nouveau texte")
        assertThat(harness.database.messageTranslationDao().transcriptionsFor(listOf("m1"))).isEmpty()
    }

    @Test
    fun `une page REST servie avant Whisper n'efface pas la transcription arrivee par la socket`() = runHarnessTest { harness ->
        harness.seedSynced(message(voice()))
        writer(harness).applyTranscription("m1", "a1", "bonjour a tous", "fr", null, null)

        MessageIngestPipeline(harness.database).ingest(listOf(message(voice())), harness.clock.now + 1_000)

        assertThat(harness.shown().attachments.single().transcription?.text).isEqualTo("bonjour a tous")
    }

    @Test
    fun `une page REST qui re-voice une langue l'emporte sur la piste periee`() = runHarnessTest { harness ->
        harness.seedSynced(message(voice()))
        writer(harness).applyAudioTranslation("m1", "a1", "es", "https://cdn/old-es.mp3", "hola", null, null, true, null, null, null)

        MessageIngestPipeline(harness.database).ingest(
            listOf(message(voice(translations = mapOf("es" to ApiAttachmentTranslation(type = "audio", url = "https://cdn/new-es.mp3"))))),
            harness.clock.now + 1_000,
        )

        assertThat(harness.shown().attachments.single().translations?.getValue("es")?.url).isEqualTo("https://cdn/new-es.mp3")
    }

    @Test
    fun `un message protege garde la transcription et ses segments dans sa seule charge`() = runHarnessTest { harness ->
        harness.seedSynced(message(voice()).copy(isViewOnce = true))

        writer(harness).applyTranscription("m1", "a1", "secret", "fr", null, null, segments = hello, speakerCount = 1)

        assertThat(harness.database.messageTranslationDao().transcriptionsFor(listOf("m1"))).isEmpty()
        val held = harness.cachedMessage("m1").attachments.single().transcription!!
        assertThat(held.segments).isEqualTo(hello)
    }
}
