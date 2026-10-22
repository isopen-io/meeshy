package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Characterisation of what the Prisme adds to a cached message, as it behaved inside the
 * monolithic repository: socket-pushed or pulled-on-demand derived server truth merged into the
 * row, idempotently, with no outbox.
 */
@RunWith(RobolectricTestRunner::class)
class MessageEnrichmentWriterTest {

    private class StubTranslationApi(
        var response: ApiResponse<TranslateResponse> = ApiResponse(success = false, error = "no translator"),
    ) : TranslationApi {
        var lastRequest: TranslateRequest? = null
        var calls: Int = 0

        override suspend fun translate(body: TranslateRequest): ApiResponse<TranslateResponse> {
            calls += 1
            lastRequest = body
            return response
        }
    }

    private fun translated(text: String) =
        ApiResponse(success = true, data = TranslateResponse(translatedText = text))

    private fun writer(harness: MessageCollaboratorHarness, translationApi: TranslationApi = StubTranslationApi()) =
        MessageEnrichmentWriter(harness.updater, translationApi)

    private fun message(id: String = "m1") =
        ApiMessage(
            id = id,
            conversationId = "c1",
            content = "hello",
            originalLanguage = "en",
            createdAt = "2026-06-01T10:00:00Z",
        )

    private fun audioMessage(id: String = "m1") =
        message(id).copy(attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")))

    @Test
    fun `a pushed translation lands in the cached message without an outbox row`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        assertThat(harness.cachedMessage("m1").translations.single { it.targetLanguage == "fr" }.translatedContent)
            .isEqualTo("Bonjour")
        assertThat(harness.outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `a pushed translation replaces the one already held for the same language`() = runHarnessTest { harness ->
        harness.seedSynced(
            message().copy(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut"))),
        )

        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        assertThat(harness.cachedMessage("m1").translations.map { it.translatedContent }).containsExactly("Bonjour")
    }

    @Test
    fun `a pushed translation is inert on an unknown message or a blank text`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val writer = writer(harness)

        writer.applyTranslation("ghost", "fr", "Bonjour")
        writer.applyTranslation("m1", "fr", "   ")

        assertThat(harness.database.messageDao().find("ghost")).isNull()
        assertThat(harness.cachedMessage("m1").translations).isEmpty()
    }

    @Test
    fun `a pushed transcription lands on the audio attachment`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())

        writer(harness).applyTranscription("m1", "a1", "Hello there", "en", 0.9, 4200L)

        val transcription = harness.cachedMessage("m1").attachments.single().transcription
        assertThat(transcription?.text).isEqualTo("Hello there")
        assertThat(transcription?.language).isEqualTo("en")
    }

    @Test
    fun `a pushed transcription without an attachment id falls back to the single audio attachment`() =
        runHarnessTest { harness ->
            harness.seedSynced(audioMessage())

            writer(harness).applyTranscription("m1", null, "Voice note", null, null, null)

            assertThat(harness.cachedMessage("m1").attachments.single().transcription?.text).isEqualTo("Voice note")
        }

    @Test
    fun `a pushed transcription is inert on an unknown message or a blank text`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        val writer = writer(harness)

        writer.applyTranscription("ghost", "a1", "Hello", "en", null, null)
        writer.applyTranscription("m1", "a1", "   ", "en", null, null)

        assertThat(harness.database.messageDao().find("ghost")).isNull()
        assertThat(harness.cachedMessage("m1").attachments.single().transcription).isNull()
    }

    @Test
    fun `a pushed voice translation lands on the audio attachment`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())

        writer(harness).applyAudioTranslation(
            messageId = "m1",
            attachmentId = "a1",
            language = "fr",
            url = "https://cdn/fr.m4a",
            transcription = "bonjour",
            durationMs = 1100L,
            format = "m4a",
            cloned = true,
            quality = 0.8,
            voiceModelId = "vm1",
            ttsModel = "chatterbox",
        )

        val translation = harness.cachedMessage("m1").attachments.single().translations!!.getValue("fr")
        assertThat(translation.url).isEqualTo("https://cdn/fr.m4a")
        assertThat(translation.transcription).isEqualTo("bonjour")
        assertThat(translation.cloned).isTrue()
        assertThat(harness.outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `an on-demand translation is stored and reported`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val api = StubTranslationApi(translated("Bonjour"))

        val stored = writer(harness, api).requestTranslation("m1", " fr ")

        assertThat(stored).isTrue()
        assertThat(api.lastRequest?.text).isEqualTo("hello")
        assertThat(api.lastRequest?.sourceLanguage).isEqualTo("en")
        assertThat(api.lastRequest?.targetLanguage).isEqualTo("fr")
        assertThat(harness.cachedMessage("m1").translations.single { it.targetLanguage == "fr" }.translatedContent)
            .isEqualTo("Bonjour")
        assertThat(harness.outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `an on-demand translation is inert when the translator fails or answers blank`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val failed = writer(harness, StubTranslationApi()).requestTranslation("m1", "fr")
        val blank = writer(harness, StubTranslationApi(translated("  "))).requestTranslation("m1", "fr")

        assertThat(failed).isFalse()
        assertThat(blank).isFalse()
        assertThat(harness.cachedMessage("m1").translations).isEmpty()
    }

    @Test
    fun `an on-demand translation never calls the translator for an unknown, deleted or blank case`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("deleted").copy(deletedAt = "2026-06-01T10:00:00Z"))
            harness.seedSynced(message("empty").copy(content = "  "))
            harness.seedSynced(message())
            val api = StubTranslationApi(translated("Bonjour"))
            val writer = writer(harness, api)

            assertThat(writer.requestTranslation("ghost", "fr")).isFalse()
            assertThat(writer.requestTranslation("deleted", "fr")).isFalse()
            assertThat(writer.requestTranslation("empty", "fr")).isFalse()
            assertThat(writer.requestTranslation("m1", "   ")).isFalse()
            assertThat(api.calls).isEqualTo(0)
        }

    @Test
    fun `an on-demand translation is idempotent when the cache already holds it`() = runHarnessTest { harness ->
        harness.seedSynced(
            message().copy(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"))),
        )

        val stored = writer(harness, StubTranslationApi(translated("Bonjour"))).requestTranslation("m1", "fr")

        assertThat(stored).isFalse()
        assertThat(harness.cachedMessage("m1").translations).hasSize(1)
    }
}
