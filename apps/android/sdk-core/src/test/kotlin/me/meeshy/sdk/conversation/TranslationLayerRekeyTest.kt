package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoredAudioTranslation
import me.meeshy.sdk.model.StoredTranscription
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * L'état posé sous l'id LOCAL d'un envoi (transcription, pistes parlées) suit le message jusqu'à son id serveur à
 * l'accusé, sans écraser ce que le serveur a déjà fait arriver, et sans jamais se répéter.
 */
@RunWith(RobolectricTestRunner::class)
class TranslationLayerRekeyTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    private fun voice(id: String) = ApiMessageAttachment(id = id, mimeType = "audio/m4a", fileUrl = "file:///tmp/$id.m4a")

    private fun served(cid: String, attachmentId: String = "att1", transcription: ApiAttachmentTranscription? = null) = ApiMessage(
        id = "srv1",
        conversationId = "c1",
        senderId = "me",
        createdAt = "2026-06-01T10:00:00Z",
        clientMessageId = cid,
        messageType = "audio",
        attachments = listOf(ApiMessageAttachment(id = attachmentId, mimeType = "audio/m4a", fileUrl = "https://cdn/v.m4a", transcription = transcription)),
    )

    private fun coordinator(harness: MessageCollaboratorHarness) =
        MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)

    private suspend fun MessageCollaboratorHarness.seedLocalState(cid: String, placeholder: String) {
        val layer = TranslationLayer.of(database)
        layer.saveTranscription(cid, StoredTranscription(cid, placeholder, "salut", "fr"), clock.now)
        layer.saveAudio(cid, StoredAudioTranslation(cid, placeholder, "es", "https://cdn/es.mp3"), clock.now)
    }

    @Test
    fun `l'accuse recopie la transcription et la piste locales sous l'id serveur et la piece du serveur`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "audio", attachments = listOf(voice("up_1")))
        harness.seedLocalState(cid, "up_1")

        coordinator.reconcileSent(cid, served(cid))

        val dao = harness.database.messageTranslationDao()
        assertThat(dao.transcriptionsFor(listOf("srv1")).map { it.attachmentId to it.text }).containsExactly("att1" to "salut")
        assertThat(dao.audioFor(listOf("srv1")).map { it.attachmentId to it.language }).containsExactly("att1" to "es")
        assertThat(dao.transcriptionsFor(listOf(cid))).isEmpty()
    }

    @Test
    fun `une transcription deja arrivee du serveur n'est jamais ecrasee par l'etat local`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "audio", attachments = listOf(voice("up_1")))
        harness.seedLocalState(cid, "up_1")
        TranslationLayer.of(harness.database)
            .saveTranscription("srv1", StoredTranscription("srv1", "att1", "texte du serveur", "fr"), harness.clock.now)

        coordinator.reconcileSent(cid, served(cid))

        assertThat(harness.database.messageTranslationDao().transcriptionsFor(listOf("srv1")).map { it.text })
            .containsExactly("texte du serveur")
    }

    @Test
    fun `un second accuse n'ecrit rien de plus`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "audio", attachments = listOf(voice("up_1")))
        harness.seedLocalState(cid, "up_1")
        coordinator.reconcileSent(cid, served(cid))
        val first = harness.database.messageTranslationDao().transcriptionsFor(listOf("srv1"))

        coordinator.reconcileSent(cid, served(cid))

        assertThat(harness.database.messageTranslationDao().transcriptionsFor(listOf("srv1"))).isEqualTo(first)
    }

    @Test
    fun `le message revenu par une page REST emporte lui aussi l'etat local`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "audio", attachments = listOf(voice("up_1")))
        harness.seedLocalState(cid, "up_1")

        MessageIngestPipeline(harness.database).ingest(listOf(served(cid)), harness.clock.now)

        val dao = harness.database.messageTranslationDao()
        assertThat(dao.transcriptionsFor(listOf("srv1")).map { it.attachmentId to it.text }).containsExactly("att1" to "salut")
        assertThat(dao.transcriptionsFor(listOf(cid))).isEmpty()
    }

    @Test
    fun `un message protege ne recoit jamais de ligne a l'accuse`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "audio", attachments = listOf(voice("up_1")))
        harness.seedLocalState(cid, "up_1")

        coordinator.reconcileSent(cid, served(cid).copy(isViewOnce = true))

        assertThat(harness.database.messageTranslationDao().transcriptionsFor(listOf("srv1", cid))).isEmpty()
        assertThat(harness.database.messageTranslationDao().audioFor(listOf("srv1", cid))).isEmpty()
    }
}
