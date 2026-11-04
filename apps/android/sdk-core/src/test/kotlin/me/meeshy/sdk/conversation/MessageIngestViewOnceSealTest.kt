package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Une vue unique ouverte par CE lecteur reste scellée quelle que soit la page servie ensuite (#15897, iso iOS
 * `APIMessageUpsert+Merge` : `viewOnceOpenedAt != nil || consumedByMe == true` ⇒ `sealAsOpenedViewOnce`). La pièce porte
 * la vue unique sans que le message la déclare : sans scellement, la colonne de recherche indexerait le texte.
 */
@RunWith(RobolectricTestRunner::class)
class MessageIngestViewOnceSealTest {

    private fun pipeline(harness: MessageCollaboratorHarness) = MessageIngestPipeline(harness.database)

    private fun served(consumedByMe: Boolean? = null) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "author",
        content = "secret",
        messageType = "image",
        createdAt = "2026-10-24T09:00:00Z",
        translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "secret-en")),
        attachments = listOf(
            ApiMessageAttachment(
                id = "a1",
                fileUrl = "https://cdn/a.jpg",
                thumbnailUrl = "https://cdn/a_t.jpg",
                originalName = "passeport.jpg",
                alt = "ma clé",
                latitude = 48.85,
                longitude = 2.35,
                isViewOnce = true,
            ),
        ),
        encryptedContent = "ciphertext==",
        location = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Chez moi"),
        sticker = MessageSticker(emoji = "🔥"),
        consumedByMe = consumedByMe,
    )

    private suspend fun MessageCollaboratorHarness.assertSealed() {
        val row = database.messageDao().find("m1")!!
        assertThat(row.contentText).isNull()
        assertThat(row.encryptedPayload).isNull()
        assertThat(row.viewOnceOpenedAt).isNotNull()
        val message = cachedMessage("m1")
        assertThat(message.consumedByMe).isTrue()
        assertThat(message.content).isEmpty()
        assertThat(message.translations).isEmpty()
        assertThat(message.encryptedContent).isNull()
        assertThat(message.location).isNull()
        assertThat(message.sticker).isNull()
        val piece = message.attachments.single()
        assertThat(piece.fileUrl).isNull()
        assertThat(piece.thumbnailUrl).isNull()
        assertThat(piece.originalName).isNull()
        assertThat(piece.alt).isNull()
        assertThat(piece.latitude).isNull()
        assertThat(piece.longitude).isNull()
    }

    @Test
    fun `a page served before the outbox reported the opening does not rehydrate the sealed row`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(listOf(served()), harness.clock.now)
        harness.database.messageDao().markViewOnceOpened("m1", openedAt = harness.clock.now)

        pipeline.ingest(listOf(served(consumedByMe = false)), harness.clock.now + 1_000)

        harness.assertSealed()
    }

    @Test
    fun `a page served after a local close does not rehydrate the row the reader sealed`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(listOf(served()), harness.clock.now)
        MessageDeltaApplier(harness.database, harness.updater, harness.clock).erasePlaintexts(listOf("m1"))

        pipeline.ingest(listOf(served(consumedByMe = false)), harness.clock.now + 1_000)

        harness.assertSealed()
    }

    @Test
    fun `a view-once opened on another device while this one was offline is sealed by the withheld page`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(listOf(served()), harness.clock.now)
        val withheld = served(consumedByMe = true).copy(
            content = "",
            translations = emptyList(),
            attachments = emptyList(),
            encryptedContent = null,
            location = null,
            sticker = null,
        )

        pipeline.ingest(listOf(withheld), harness.clock.now + 1_000)

        harness.assertSealed()
    }

    @Test
    fun `a first ingestion of a view-once already opened by the reader is stored sealed`() = runHarnessTest { harness ->
        pipeline(harness).ingest(listOf(served(consumedByMe = true)), harness.clock.now)

        harness.assertSealed()
    }

    @Test
    fun `a sealed row served again is not rewritten`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(listOf(served(consumedByMe = true)), harness.clock.now)
        val before = harness.database.messageDao().find("m1")!!

        val changed = pipeline.ingest(listOf(served(consumedByMe = true)), harness.clock.now + 1_000)

        assertThat(changed).isEmpty()
        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isEqualTo(before.changeVersion)
    }

    @Test
    fun `a view-once the reader has not opened keeps its served content`() = runHarnessTest { harness ->
        pipeline(harness).ingest(listOf(served(consumedByMe = false)), harness.clock.now)

        val message = harness.cachedMessage("m1")
        assertThat(message.content).isEqualTo("secret")
        assertThat(message.attachments.single().fileUrl).isEqualTo("https://cdn/a.jpg")
        assertThat(harness.database.messageDao().find("m1")!!.viewOnceOpenedAt).isNull()
    }
}
