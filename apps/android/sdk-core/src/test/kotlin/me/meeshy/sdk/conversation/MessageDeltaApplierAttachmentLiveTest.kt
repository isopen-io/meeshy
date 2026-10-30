package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.AttachmentReadyEvent
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.MessageAttachmentUpdatedEvent
import me.meeshy.sdk.model.translation.SharedTranslation
import me.meeshy.sdk.model.translation.SharedTranslationBinding
import me.meeshy.sdk.model.translation.SharedTranslationInner
import me.meeshy.sdk.model.translation.SharedTranslationKeySource
import me.meeshy.sdk.model.translation.SharedTranslationSeal
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.withAccountTicket
import me.meeshy.sdk.net.SessionTransitionFlags
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** L'accusé d'une pièce, son enrichissement et la traduction partagée écrivent la ligne Room en place, sans réseau. */
@RunWith(RobolectricTestRunner::class)
class MessageDeltaApplierAttachmentLiveTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val conversationId = "64b7f0c2a1b2c3d4e5f60718"
    private val messageId = "64b7f0c2a1b2c3d4e5f60719"

    private fun applier(harness: MessageCollaboratorHarness) =
        MessageDeltaApplier(harness.database, harness.updater, harness.clock)

    private fun message(
        content: String = "",
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
        originalLanguage: String? = "en",
    ) = ApiMessage(
        id = messageId, conversationId = conversationId, senderId = "author", content = content, recipientCount = 1,
        originalLanguage = originalLanguage, isEncrypted = isEncrypted, encryptionMode = encryptionMode,
        attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/mp4", fileUrl = "https://cdn/a1")),
    )

    private fun status(userId: String = "other") = AttachmentStatusUpdatedEvent(
        attachmentId = "a1", messageId = messageId, conversationId = conversationId, userId = userId, action = "listened",
        updatedAt = "2026-10-29T10:00:00Z", playPositionMs = 4_000, durationMs = 10_000,
    )

    private fun updated(thumbnail: String = "https://cdn/t") = MessageAttachmentUpdatedEvent(
        messageId = messageId, conversationId = conversationId, attachmentId = "a1",
        attachment = ApiMessageAttachment(
            id = "a1", thumbnailUrl = thumbnail, transcription = ApiAttachmentTranscription(text = "bonjour", language = "fr"),
        ),
    )

    private fun ready(target: String = "messageAttachment", conversation: String? = conversationId) = AttachmentReadyEvent(
        attachmentId = "a1", target = target, messageId = messageId, conversationId = conversation, processingState = "ready",
        attachment = json.parseToJsonElement("""{"id":"a1","fileUrl":"https://cdn/a1-final","duration":12000}"""),
    )

    @Test
    fun `an acknowledgement from the other participant marks the piece in Room`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val handled = applier(harness).apply(status(), viewerId = "me")

        assertThat(handled).isTrue()
        assertThat(harness.cachedMessage(messageId).attachments.single().listenedByAllAt).isEqualTo("2026-10-29T10:00:00Z")
    }

    @Test
    fun `my own acknowledgement moves my resume position in Room`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(status(userId = "me"), viewerId = "me")

        assertThat(harness.cachedMessage(messageId).attachments.single().currentUserConsumption?.lastPlayPositionMs).isEqualTo(4_000)
    }

    @Test
    fun `an acknowledgement for a message not in Room is handled and writes nothing`() = runHarnessTest { harness ->
        val handled = applier(harness).apply(status(), viewerId = "me")

        assertThat(handled).isTrue()
        assertThat(harness.database.messageDao().find(messageId)).isNull()
    }

    @Test
    fun `a modified piece lands in the bubble`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val handled = applier(harness).apply(updated(), viewerId = "me")

        val piece = harness.cachedMessage(messageId).attachments.single()
        assertThat(handled).isTrue()
        assertThat(piece.thumbnailUrl).isEqualTo("https://cdn/t")
        assertThat(piece.transcription?.text).isEqualTo("bonjour")
        assertThat(piece.fileUrl).isEqualTo("https://cdn/a1")
    }

    @Test
    fun `a ready piece lands in the bubble, read with the same decoder as the cache`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val handled = applier(harness).apply(ready(), viewerId = "me")

        val piece = harness.cachedMessage(messageId).attachments.single()
        assertThat(handled).isTrue()
        assertThat(piece.fileUrl).isEqualTo("https://cdn/a1-final")
        assertThat(piece.duration).isEqualTo(12_000)
    }

    @Test
    fun `the ready media of a post never reaches a message`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val before = harness.database.messageDao().find(messageId)!!.payload

        val handled = applier(harness).apply(ready(target = "postMedia", conversation = null), viewerId = "me")

        assertThat(handled).isTrue()
        assertThat(harness.database.messageDao().find(messageId)!!.payload).isEqualTo(before)
    }

    @Test
    fun `a sealed message in Room is never written by any of the three`() = runHarnessTest { harness ->
        harness.seedSynced(message(content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee"))
        val before = harness.database.messageDao().find(messageId)!!.payload
        val applier = applier(harness)

        applier.apply(status(), viewerId = "me")
        applier.apply(updated(), viewerId = "me")
        applier.apply(ready(), viewerId = "me")

        assertThat(harness.database.messageDao().find(messageId)!!.payload).isEqualTo(before)
    }

    @Test
    fun `an optimistic local bubble is enriched too, since the gateway keys by the server id`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        applier(harness).apply(updated("https://cdn/t2"), viewerId = "me")
        applier(harness).apply(updated("https://cdn/t2"), viewerId = "me")

        assertThat(harness.cachedMessage(messageId).attachments.single().thumbnailUrl).isEqualTo("https://cdn/t2")
    }

    // ── Traduction partagée ──

    private fun shared(target: String = "fr", text: String = "Bonjour à tous", sourceContent: String = "Hello everyone") =
        SharedTranslation(
            "t1", conversationId, messageId, target,
            SharedTranslationSeal.seal(
                SharedTranslationBinding(conversationId, messageId, target, sourceContent),
                SharedTranslationKeySource.MessageContent,
                SharedTranslationInner(text = text, sourceLanguage = "en", engine = "apple-translate"),
            ),
            "u2", "2026-10-29T10:00:00.000Z",
        )

    @Test
    fun `a shared translation joins the translations of the cached message`() = runHarnessTest { harness ->
        harness.seedSynced(message(content = "Hello everyone"))

        applier(harness).mergeSharedTranslation(shared(), readerLanguages = listOf("fr", "en"))

        val translation = harness.cachedMessage(messageId).translations.single()
        assertThat(translation.targetLanguage).isEqualTo("fr")
        assertThat(translation.translatedContent).isEqualTo("Bonjour à tous")
    }

    @Test
    fun `a shared translation never overwrites one the gateway already served`() = runHarnessTest { harness ->
        harness.seedSynced(
            message(content = "Hello everyone").copy(
                translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut tout le monde")),
            ),
        )

        applier(harness).mergeSharedTranslation(shared(), listOf("fr"))

        assertThat(harness.cachedMessage(messageId).translations.single().translatedContent).isEqualTo("Salut tout le monde")
    }

    @Test
    fun `a shared translation is not written into a sealed message`() = runHarnessTest { harness ->
        harness.seedSynced(message(content = "Hello everyone", isEncrypted = true, encryptionMode = "e2ee"))
        val before = harness.database.messageDao().find(messageId)!!.payload

        applier(harness).mergeSharedTranslation(shared(), listOf("fr"))

        assertThat(harness.database.messageDao().find(messageId)!!.payload).isEqualTo(before)
    }

    @Test
    fun `a shared translation for a message not in Room is dropped`() = runHarnessTest { harness ->
        applier(harness).mergeSharedTranslation(shared(), listOf("fr"))

        assertThat(harness.database.messageDao().find(messageId)).isNull()
    }

    // ── Compte : l'écriture suit le compte sous lequel l'événement est arrivé ──

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    @Test
    fun `an event that arrived under account A writes nothing once account B is signed in`(): Unit = runBlocking {
        val harness = MessageCollaboratorHarness()
        try {
            val owner = Owner("A")
            val transition = SessionTransitionFlags()
            val fence = AccountFence(owner, transition)
            val guarded = MessageDeltaApplier(harness.database, CachedMessageUpdater(harness.database, harness.database.messageDao(), fence), harness.clock)
            harness.seedSynced(message())
            val ticketOfA = fence.ticket()

            owner.id = "B"
            transition.bumpGeneration()
            withAccountTicket(ticketOfA) {
                guarded.apply(updated(), viewerId = "me")
                guarded.apply(status(), viewerId = "me")
            }

            val piece = harness.cachedMessage(messageId).attachments.single()
            assertThat(piece.thumbnailUrl).isNull()
            assertThat(piece.listenedByAllAt).isNull()
        } finally {
            harness.database.close()
        }
    }
}
