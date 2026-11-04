package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.StoredTextTranslation
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.TranslateRequest
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les traductions déjà reçues vivent dans des lignes dédiées, uniques par (message, langue), superposées au message. */
@RunWith(RobolectricTestRunner::class)
class TranslationLayerTest {

    private class NoTranslator : TranslationApi {
        var calls = 0
        override suspend fun translate(body: TranslateRequest): ApiResponse<TranslateResponse> {
            calls += 1
            return ApiResponse(success = false)
        }

        override suspend fun job(jobId: String): ApiResponse<me.meeshy.sdk.model.TranslationJob> = ApiResponse(success = false)

        override suspend fun cancelJob(jobId: String): ApiResponse<kotlinx.serialization.json.JsonElement> = ApiResponse(success = false)
    }

    private fun message(id: String = "m1") =
        ApiMessage(id = id, conversationId = "c1", content = "hello", originalLanguage = "en", createdAt = "2026-06-01T10:00:00Z")

    private fun audioMessage() =
        message().copy(attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")))

    private fun writer(harness: MessageCollaboratorHarness, translator: TranslationApi = NoTranslator()) =
        MessageEnrichmentWriter(harness.updater, translator, TranslationLayer.of(harness.database), harness.clock)

    private suspend fun MessageCollaboratorHarness.shown(id: String = "m1"): ApiMessage {
        val layer = TranslationLayer.of(database)
        val stored = cachedMessage(id)
        layer.ensureLoaded(listOf(stored.id))
        return layer.project(LocalMessage(stored)).message
    }

    @Test
    fun `recevoir une traduction ecrit une ligne et laisse la charge du message intacte`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val payloadBefore = harness.database.messageDao().find("m1")!!.payload

        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        assertThat(harness.database.messageDao().find("m1")!!.payload).isEqualTo(payloadBefore)
        assertThat(harness.database.messageTranslationDao().textsFor(listOf("m1")).map { it.content }).containsExactly("Bonjour")
        assertThat(harness.shown().translations.single { it.targetLanguage == "fr" }.translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `une traduction recue reveille les observateurs du message`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val before = harness.database.messageDao().find("m1")!!.changeVersion

        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isGreaterThan(before)
    }

    @Test
    fun `l'id local et l'id serveur d'un meme message donnent une seule ligne par langue`() = runHarnessTest { harness ->
        val cid = "cid_" + java.util.UUID.randomUUID().toString().lowercase()
        harness.seedSynced(message())
        MessageIdReconciliation.recordAck(harness.database, cid, "m1", "c1", harness.clock.now)

        writer(harness).applyTranslation(cid, "fr", "Salut")
        writer(harness).applyTranslation("m1", "FR", "Bonjour")

        val rows = harness.database.messageTranslationDao().textsFor(listOf("m1", cid))
        assertThat(rows.map { it.language to it.content }).containsExactly("fr" to "Bonjour")
    }

    @Test
    fun `une transcription et une piste audio sont rangees par piece jointe sans toucher la charge`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        val payloadBefore = harness.database.messageDao().find("m1")!!.payload
        val w = writer(harness)

        w.applyTranscription("m1", "a1", "Hello there", "en", 0.9, 4200L)
        w.applyAudioTranslation("m1", "a1", "fr", "https://cdn/fr.m4a", "Bonjour", 4000L, "m4a", true, null, null, null)

        assertThat(harness.database.messageDao().find("m1")!!.payload).isEqualTo(payloadBefore)
        val attachment = harness.shown().attachments.single()
        assertThat(attachment.transcription?.text).isEqualTo("Hello there")
        assertThat(attachment.translations.orEmpty()["fr"]?.url).isEqualTo("https://cdn/fr.m4a")
        assertThat(harness.database.messageTranslationDao().transcriptionsFor(listOf("m1"))).hasSize(1)
        assertThat(harness.database.messageTranslationDao().audioFor(listOf("m1"))).hasSize(1)
    }

    @Test
    fun `plusieurs vocaux d'un meme message gardent chacun leur transcription`() = runHarnessTest { harness ->
        harness.seedSynced(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "a1", mimeType = "audio/m4a"),
                    ApiMessageAttachment(id = "a2", mimeType = "audio/m4a"),
                ),
            ),
        )
        val w = writer(harness)

        w.applyTranscription("m1", "a1", "premier", "en", null, null)
        w.applyTranscription("m1", "a2", "second", "en", null, null)

        assertThat(harness.shown().attachments.map { it.transcription?.text }).containsExactly("premier", "second").inOrder()
    }

    @Test
    fun `une langue hors prisme est ecrite sur disque mais ni retenue ni projetee`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val layer = TranslationLayer.of(harness.database).also { it.prism = listOf("fr") }

        writer(harness).applyTranslation("m1", "es", "Hola")
        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        assertThat(harness.shown().translations.map { it.targetLanguage }).containsExactly("fr")
        assertThat(harness.database.messageTranslationDao().textsFor(listOf("m1")).map { it.language }).containsExactly("es", "fr")
        layer.prism = null
    }

    @Test
    fun `editer le contenu invalide les trois familles par id local et par id serveur`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        val w = writer(harness)
        w.applyTranslation("m1", "fr", "Bonjour")
        w.applyTranscription("m1", "a1", "Hello", "en", null, null)
        w.applyAudioTranslation("m1", "a1", "fr", "https://cdn/fr.m4a", "", null, null, false, null, null, null)
        val mutations = MessageMutationWriter(harness.updater, harness.outbox, harness.clock, translations = TranslationLayer.of(harness.database))

        mutations.editOptimistic("m1", "hello again")

        val dao = harness.database.messageTranslationDao()
        assertThat(dao.textsFor(listOf("m1"))).isEmpty()
        assertThat(dao.transcriptionsFor(listOf("m1"))).isEmpty()
        assertThat(dao.audioFor(listOf("m1"))).isEmpty()
        assertThat(harness.shown().translations).isEmpty()
    }

    @Test
    fun `requestTranslation reaffiche une traduction deja recue sans la redemander`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val translator = NoTranslator()
        val w = writer(harness, translator)
        w.applyTranslation("m1", "fr", "Bonjour")

        val asked = w.requestTranslation("m1", "fr")

        assertThat(asked).isFalse()
        assertThat(translator.calls).isEqualTo(0)
    }

    @Test
    fun `la premiere image d'un fil en cache est deja traduite`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        writer(harness).applyTranslation("m1", "fr", "Bonjour")
        val source = MessageCacheSource(
            "c1", harness.database, harness.database.messageDao(), harness.database.syncMetaDao(), mockk<MessageApi>(),
            harness.clock, flowOf(HistoryWindow.Recent(50)), translations = TranslationLayer(harness.database, harness.database.messageTranslationDao()),
        )

        val first = source.observe().first()!!

        assertThat(first.single().message.translations.single().translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `une fenetre se charge en lecture groupee puis le L1 la sert sans relire le disque`() = runHarnessTest { harness ->
        listOf("m1", "m2", "m3").forEach { harness.seedSynced(message(it)) }
        val dao = harness.database.messageTranslationDao()
        listOf("m1", "m2", "m3").forEach {
            dao.upsertText(me.meeshy.core.database.entity.MessageTranslationEntity(it, "fr", "Bonjour $it", "en", null, null, 1L))
        }
        val layer = TranslationLayer(harness.database, dao)

        layer.ensureLoaded(listOf("m1", "m2", "m3"))
        dao.deleteTextsFor(listOf("m1", "m2", "m3"))

        val shown = listOf("m1", "m2", "m3").map { layer.project(LocalMessage(message(it))).message.translations.single().translatedContent }
        assertThat(shown).containsExactly("Bonjour m1", "Bonjour m2", "Bonjour m3").inOrder()
    }

    @Test
    fun `un L1 inchange rend la meme instance et le L1 reste borne`() = runHarnessTest { harness ->
        val layer = TranslationLayer(harness.database, harness.database.messageTranslationDao(), capacity = 2)
        harness.seedSynced(message("m1"))
        layer.saveText("m1", StoredTextTranslation("m1", "fr", "Bonjour"), 1L)
        val local = LocalMessage(message("m1"))

        assertThat(layer.project(local)).isSameInstanceAs(layer.project(local))

        layer.ensureLoaded(listOf("m2", "m3", "m4"))
        assertThat(layer.heldMessageCount()).isAtMost(2)
    }
}
