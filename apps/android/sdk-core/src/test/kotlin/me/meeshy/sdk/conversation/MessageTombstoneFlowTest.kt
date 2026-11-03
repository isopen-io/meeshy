package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Un événement arrivé AVANT son message, de bout en bout : gardé, puis rejoué à l'arrivée de la ligne. */
@RunWith(RobolectricTestRunner::class)
class MessageTombstoneFlowTest {

    private fun served(id: String = "m1", content: String = "salut") = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = "u1",
        content = content,
        createdAt = "2026-06-01T10:00:00Z",
    )

    private fun reply(parent: String = "m1", quoted: String = "salut") = ApiMessage(
        id = "r1",
        conversationId = "c1",
        senderId = "u2",
        content = "d'accord",
        createdAt = "2026-06-01T10:01:00Z",
        replyToId = parent,
        replyTo = ApiMessageReplyPreview(id = parent, content = quoted),
    )

    private fun events(harness: MessageCollaboratorHarness) = MessageEventBuffer(harness.clock)

    private fun writer(harness: MessageCollaboratorHarness, events: MessageEventBuffer) =
        MessageMutationWriter(harness.updater, harness.outbox, harness.clock, null, events)

    private fun tombstones(harness: MessageCollaboratorHarness, events: MessageEventBuffer) =
        MessageTombstoneWriter(harness.updater, null, events)

    private suspend fun arrive(harness: MessageCollaboratorHarness, events: MessageEventBuffer, vararg messages: ApiMessage) {
        MessageIngestPipeline(harness.database, events = events).ingest(messages.toList(), harness.clock.now)
    }

    @Test
    fun `une suppression arrivee avant le message le rend supprime des son arrivee`() = runHarnessTest { harness ->
        val events = events(harness)
        assertThat(tombstones(harness, events).markDeleted("m1", "2026-06-01T11:00:00Z")).isFalse()

        arrive(harness, events, served())

        val row = harness.cachedMessage("m1")
        assertThat(row.deletedAt).isEqualTo("2026-06-01T11:00:00Z")
        assertThat(row.content).isEmpty()
    }

    @Test
    fun `une edition arrivee avant le message remplace le texte et retire les traductions`() = runHarnessTest { harness ->
        val events = events(harness)
        writer(harness, events).applyServerEdit(served(content = "corrige").copy(isEdited = true, editedAt = "2026-06-01T10:30:00Z"))

        arrive(
            harness,
            events,
            served().copy(translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "hi"))),
        )

        val row = harness.cachedMessage("m1")
        assertThat(row.content).isEqualTo("corrige")
        assertThat(row.isEdited).isTrue()
        assertThat(row.translations).isEmpty()
    }

    @Test
    fun `une reaction arrivee avant le message est comptee`() = runHarnessTest { harness ->
        val events = events(harness)
        writer(harness, events).applyReactionDelta("m1", "👍", 1)

        arrive(harness, events, served())

        assertThat(harness.cachedMessage("m1").reactionSummary).containsExactly("👍", 1)
    }

    @Test
    fun `edition reaction et suppression avant le message - la suppression l emporte`() = runHarnessTest { harness ->
        val events = events(harness)
        writer(harness, events).applyServerEdit(served(content = "corrige").copy(isEdited = true, editedAt = "2026-06-01T10:30:00Z"))
        writer(harness, events).applyReactionDelta("m1", "👍", 1)
        tombstones(harness, events).markDeleted("m1", "2026-06-01T11:00:00Z")

        arrive(harness, events, served())

        val row = harness.cachedMessage("m1")
        assertThat(row.deletedAt).isNotNull()
        assertThat(row.content).isEmpty()
    }

    @Test
    fun `un evenement echu n est pas rejoue`() = runHarnessTest { harness ->
        val events = events(harness)
        tombstones(harness, events).markDeleted("m1", "2026-06-01T11:00:00Z")
        harness.clock.now += 301_000L

        arrive(harness, events, served())

        assertThat(harness.cachedMessage("m1").deletedAt).isNull()
    }

    @Test
    fun `une edition ancienne rejouee ne regresse pas une edition plus recente deja en cache`() = runHarnessTest { harness ->
        harness.seedSynced(served(content = "recent").copy(isEdited = true, editedAt = "2026-06-01T10:30:10Z"))
        val events = events(harness)

        writer(harness, events).applyServerEdit(served(content = "ancien").copy(isEdited = true, editedAt = "2026-06-01T10:30:00Z"))

        assertThat(harness.cachedMessage("m1").content).isEqualTo("recent")
    }

    @Test
    fun `une edition plus recente s applique et le nouveau texte suit la citation`() = runHarnessTest { harness ->
        harness.seedSynced(served())
        harness.seedSynced(reply())
        val events = events(harness)

        writer(harness, events).applyServerEdit(served(content = "corrige").copy(isEdited = true, editedAt = "2026-06-01T10:30:00Z"))

        assertThat(harness.cachedMessage("m1").content).isEqualTo("corrige")
        assertThat(harness.cachedMessage("r1").replyTo?.content).isEqualTo("corrige")
    }

    @Test
    fun `un parent protege ne republie pas son nouveau texte dans la citation`() = runHarnessTest { harness ->
        harness.seedSynced(served().copy(isViewOnce = true))
        harness.seedSynced(reply())
        val events = events(harness)

        writer(harness, events).applyServerEdit(
            served(content = "secret").copy(isViewOnce = true, isEdited = true, editedAt = "2026-06-01T10:30:00Z"),
        )

        assertThat(harness.cachedMessage("r1").replyTo?.content).isEqualTo("salut")
    }

    @Test
    fun `la suppression scelle la citation des reponses`() = runHarnessTest { harness ->
        harness.seedSynced(served())
        harness.seedSynced(reply())
        val events = events(harness)

        assertThat(tombstones(harness, events).markDeleted("m1", "2026-06-01T11:00:00Z")).isTrue()

        val quote = harness.cachedMessage("r1").replyTo!!
        assertThat(quote.content).isEmpty()
        assertThat(quote.deletedAt).isEqualTo("2026-06-01T11:00:00Z")
    }

    @Test
    fun `une vue unique ouverte garde son enveloppe quand le serveur annonce la suppression`() = runHarnessTest { harness ->
        harness.seedSynced(served(content = "secret").copy(isViewOnce = true))

        tombstones(harness, events(harness)).markDeleted("m1", "2026-06-01T11:00:00Z", sparingOpenedViewOnce = true)

        val row = harness.cachedMessage("m1")
        assertThat(row.deletedAt).isNull()
        assertThat(row.content).isEmpty()
        assertThat(row.consumedByMe).isTrue()
    }

    @Test
    fun `markUndeleted rend le message apres un refus serveur`() = runHarnessTest { harness ->
        val original = served(content = "garde")
        harness.seedSynced(original)
        val events = events(harness)
        tombstones(harness, events).markDeleted("m1", "2026-06-01T11:00:00Z")

        assertThat(tombstones(harness, events).markUndeleted("m1", snapshot = original)).isTrue()

        val row = harness.cachedMessage("m1")
        assertThat(row.deletedAt).isNull()
        assertThat(row.content).isEqualTo("garde")
    }

    @Test
    fun `purgeMessages retire la ligne par son id serveur`() = runHarnessTest { harness ->
        harness.seedSynced(served())

        writer(harness, events(harness)).purgeMessages(listOf("m1"))

        assertThat(harness.database.messageDao().find("m1")).isNull()
    }

    @Test
    fun `les ecritures ciblees ne touchent que leur drapeau`() = runHarnessTest { harness ->
        harness.seedSynced(served())
        val writer = writer(harness, events(harness))

        writer.setBlurred("m1", true)
        writer.setViewOnceCount("m1", 3)
        writer.setViewOnceCount("m1", 1)
        writer.setPinned("m1", "2026-06-01T12:00:00Z", "u9")

        val row = harness.cachedMessage("m1")
        assertThat(row.isBlurred).isTrue()
        assertThat(row.viewOnceCount).isEqualTo(3)
        assertThat(row.pinnedAt).isEqualTo("2026-06-01T12:00:00Z")
        assertThat(row.content).isEqualTo("salut")
    }
}
