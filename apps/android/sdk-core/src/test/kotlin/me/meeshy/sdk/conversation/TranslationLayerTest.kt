package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.model.PersonalMessageVisibilityRef
import me.meeshy.sdk.model.StoredTextTranslation
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.TranslationApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les traductions déjà reçues vivent dans des lignes dédiées, uniques par (message, langue), superposées au message. */
@RunWith(RobolectricTestRunner::class)
class TranslationLayerTest {

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

    private suspend fun MessageCollaboratorHarness.retained(vararg ids: String): Int {
        val dao = database.messageTranslationDao()
        val all = ids.toList()
        return dao.textsFor(all).size + dao.transcriptionsFor(all).size + dao.audioFor(all).size
    }

    private suspend fun MessageCollaboratorHarness.enrichFully(w: MessageEnrichmentWriter = writer(this)) {
        w.applyTranslation("m1", "fr", "Bonjour")
        w.applyTranscription("m1", "a1", "Hello", "en", null, null)
        w.applyAudioTranslation("m1", "a1", "fr", "https://cdn/fr.m4a", "Bonjour", null, null, false, null, null, null)
        check(retained("m1") == 3)
    }

    private fun deltas(harness: MessageCollaboratorHarness) = MessageDeltaApplier(harness.database, harness.updater, harness.clock)

    @Test
    fun `une suppression serveur emporte les trois familles et la pierre tombale n'en recoit aucune`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        harness.enrichFully()

        deltas(harness).apply(MessageRemoved("m1", "c1", deletedAt = "2026-06-01T11:00:00Z"), viewerId = null)

        assertThat(harness.retained("m1")).isEqualTo(0)
        assertThat(harness.shown().translations).isEmpty()
        assertThat(harness.shown().attachments.flatMap { listOfNotNull(it.transcription) }).isEmpty()
    }

    @Test
    fun `une expiration servie et un masquage pour moi retirent la ligne et ses traductions`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        harness.seedSynced(message("m2"))
        harness.enrichFully()
        writer(harness).applyTranslation("m2", "fr", "Salut")

        deltas(harness).apply(MessageRemoved("m1", "c1", expired = true), viewerId = null)
        deltas(harness).apply(MessageHiddenForMeEvent(messages = listOf(PersonalMessageVisibilityRef("m2", "c1"))), viewerId = null)

        assertThat(harness.retained("m1", "m2")).isEqualTo(0)
    }

    @Test
    fun `la purge d'une vue unique emporte ses lignes et la projection n'y remet rien`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        harness.enrichFully()
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.cached(harness.cachedMessage("m1").copy(isViewOnce = true, consumedByMe = true), harness.clock.now)),
        )

        deltas(harness).apply(MessageViewOncePurgedEvent("m1", "c1"), viewerId = null)

        assertThat(harness.retained("m1")).isEqualTo(0)
        val shown = harness.shown()
        assertThat(shown.translations).isEmpty()
        assertThat(shown.attachments.single().transcription).isNull()
        assertThat(shown.attachments.single().translations.orEmpty()).isEmpty()
    }

    @Test
    fun `une suppression optimiste emporte les lignes retenues`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        harness.enrichFully()

        MessageMutationWriter(harness.updater, harness.outbox, harness.clock).deleteOptimistic("m1")

        assertThat(harness.retained("m1")).isEqualTo(0)
    }

    @Test
    fun `une vue unique ou un ephemere garde sa traduction dans sa charge, jamais dans une ligne`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage().copy(isViewOnce = true))
        harness.seedSynced(message("m2").copy(expiresAt = "2026-06-02T10:00:00Z"))
        val w = writer(harness)

        harness.enrichFullyAllowingNone(w)
        w.applyTranslation("m2", "fr", "Salut")

        assertThat(harness.retained("m1", "m2")).isEqualTo(0)
        assertThat(harness.cachedMessage("m1").translations.single().translatedContent).isEqualTo("Bonjour")
        assertThat(harness.cachedMessage("m1").attachments.single().transcription?.text).isEqualTo("Hello")
        assertThat(harness.cachedMessage("m2").translations.single().translatedContent).isEqualTo("Salut")
    }

    private suspend fun MessageCollaboratorHarness.enrichFullyAllowingNone(w: MessageEnrichmentWriter) {
        w.applyTranslation("m1", "fr", "Bonjour")
        w.applyTranscription("m1", "a1", "Hello", "en", null, null)
        w.applyAudioTranslation("m1", "a1", "fr", "https://cdn/fr.m4a", "Bonjour", null, null, false, null, null, null)
    }

    @Test
    fun `une traduction socket d'un message chiffre n'est ni affichee ni persistee`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage().copy(isEncrypted = true, encryptionMode = "e2ee"))
        val payloadBefore = harness.database.messageDao().find("m1")!!.payload

        harness.enrichFullyAllowingNone(writer(harness))
        MessageEnrichmentWriter(harness.updater, NoTranslator()).applyTranslation("m1", "fr", "forgee")

        assertThat(harness.retained("m1")).isEqualTo(0)
        assertThat(harness.database.messageDao().find("m1")!!.payload).isEqualTo(payloadBefore)
    }

    @Test
    fun `une edition recue par REST remplace l'ancienne traduction retenue par celle du nouveau texte`() = runHarnessTest { harness ->
        harness.seedSynced(message().copy(content = "RDV 14h"))
        writer(harness).applyTranslation("m1", "fr", "RDV 14h fr")
        val edited = message().copy(
            content = "RDV 16h",
            isEdited = true,
            editedAt = "2026-06-01T11:00:00Z",
            translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "RDV 16h fr")),
        )

        MessageIngestPipeline(harness.database).ingest(listOf(edited), harness.clock.now)

        assertThat(harness.retained("m1")).isEqualTo(0)
        assertThat(harness.shown().translations.single { it.targetLanguage == "fr" }.translatedContent).isEqualTo("RDV 16h fr")
    }

    @Test
    fun `une page REST au meme texte garde la traduction retenue`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        MessageIngestPipeline(harness.database).ingest(listOf(message().copy(updatedAt = "2026-06-01T10:05:00Z")), harness.clock.now)

        assertThat(harness.retained("m1")).isEqualTo(1)
        assertThat(harness.shown().translations.single().translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `une traduction socket en retard pour l'ancien texte ne l'emporte pas sur la charge REST du texte edite`() = runHarnessTest { harness ->
        harness.seedSynced(message().copy(content = "RDV 14h"))
        val edited = message().copy(content = "RDV 16h", isEdited = true, editedAt = "2026-06-01T11:00:00Z")
        MessageIngestPipeline(harness.database).ingest(listOf(edited), harness.clock.now)
        writer(harness).applyTranslation("m1", "fr", "RDV 14h fr")

        val served = edited.copy(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "RDV 16h fr")))
        MessageIngestPipeline(harness.database).ingest(listOf(served), harness.clock.now)

        assertThat(harness.shown().translations.single { it.targetLanguage == "fr" }.translatedContent).isEqualTo("RDV 16h fr")
    }

    @Test
    fun `une traduction socket plus recente que la page REST reste affichee quand la page resert la meme traduction`() = runHarnessTest { harness ->
        val served = message().copy(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut")))
        harness.seedSynced(served)
        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        MessageIngestPipeline(harness.database).ingest(listOf(served.copy(updatedAt = "2026-06-01T10:05:00Z")), harness.clock.now)

        assertThat(harness.retained("m1")).isEqualTo(1)
        assertThat(harness.shown().translations.single { it.targetLanguage == "fr" }.translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `une retraduction servie au meme texte l'emporte sur la ligne retenue`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        writer(harness).applyTranslation("m1", "fr", "Bonjour")

        val retranslated = message().copy(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour à vous")))
        MessageIngestPipeline(harness.database).ingest(listOf(retranslated), harness.clock.now)

        assertThat(harness.shown().translations.single { it.targetLanguage == "fr" }.translatedContent).isEqualTo("Bonjour à vous")
    }

    @Test
    fun `quitter une conversation emporte les traductions de tous ses messages`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        harness.enrichFully()

        harness.database.messageDao().clearConversation("c1")

        assertThat(harness.retained("m1")).isEqualTo(0)
    }

    @Test
    fun `la bulle optimiste remplacee par sa jumelle serveur ne perd pas les traductions rangees sous l'id serveur`() = runHarnessTest { harness ->
        val cid = "cid_" + java.util.UUID.randomUUID().toString().lowercase()
        val bubble = message(cid).copy(clientMessageId = cid)
        harness.database.messageDao().upsertAll(listOf(MessageEntityFactory.cached(bubble, harness.clock.now).copy(serverId = "srv1")))
        harness.database.messageTranslationDao().upsertText(
            me.meeshy.core.database.entity.MessageTranslationEntity("srv1", "fr", "Bonjour", "en", null, null, 1L),
        )

        MessageIngestPipeline(harness.database).ingest(listOf(message("srv1").copy(clientMessageId = cid)), harness.clock.now)

        assertThat(harness.database.messageDao().find(cid)).isNull()
        assertThat(harness.database.messageTranslationDao().textsFor(listOf("srv1")).map { it.content }).containsExactly("Bonjour")
    }

    @Test
    fun `la fin de session vide le L1 et le compte suivant relit son propre disque`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        writer(harness).applyTranslation("m1", "fr", "Bonjour de A")
        val layer = TranslationLayer.of(harness.database)
        check(harness.shown().translations.single().translatedContent == "Bonjour de A")

        harness.database.messageTranslationDao().deleteTextsFor(listOf("m1"))
        layer.clear()
        assertThat(layer.heldMessageCount()).isEqualTo(0)
        harness.database.messageTranslationDao().upsertText(
            me.meeshy.core.database.entity.MessageTranslationEntity("m1", "fr", "Bonjour de B", "en", null, null, 2L),
        )

        assertThat(harness.shown().translations.single().translatedContent).isEqualTo("Bonjour de B")
    }

    @Test
    fun `editer le contenu invalide les trois familles par id local et par id serveur`() = runHarnessTest { harness ->
        harness.seedSynced(audioMessage())
        val w = writer(harness)
        w.applyTranslation("m1", "fr", "Bonjour")
        w.applyTranscription("m1", "a1", "Hello", "en", null, null)
        w.applyAudioTranslation("m1", "a1", "fr", "https://cdn/fr.m4a", "", null, null, false, null, null, null)
        val mutations = MessageMutationWriter(harness.updater, harness.outbox, harness.clock)

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
