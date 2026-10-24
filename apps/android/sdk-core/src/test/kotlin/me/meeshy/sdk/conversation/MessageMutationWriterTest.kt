package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.kindEnum
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Characterisation of the optimistic mutations as they behaved inside the monolithic repository:
 * the cached row moves instantly, the matching mutation joins its outbox lane, and a bubble the
 * server does not know yet is refused.
 */
@RunWith(RobolectricTestRunner::class)
class MessageMutationWriterTest {

    private fun writer(harness: MessageCollaboratorHarness) =
        MessageMutationWriter(harness.updater, harness.outbox, harness.clock)

    private fun message(id: String = "m1", conversationId: String = "c1") =
        ApiMessage(id = id, conversationId = conversationId, content = "salut", createdAt = "2026-06-01T10:00:00Z")

    private suspend fun MessageCollaboratorHarness.seedUnsent(id: String = "cid_1") {
        database.messageDao().upsertAll(
            listOf(MessageEntityFactory.local(message(id), clock.now, LocalSendState.SENDING)),
        )
    }

    @Test
    fun `adding a reaction bumps the cached summary and queues ADD_REACTION`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val applied = writer(harness).toggleReactionOptimistic("m1", "❤️", isAdding = true)

        assertThat(applied).isTrue()
        assertThat(harness.cachedMessage("m1").reactionSummary).containsExactly("❤️", 1)
        val queued = harness.outbox.deliverable(OutboxLanes.REACTION).single()
        assertThat(queued.kindEnum).isEqualTo(OutboxKind.ADD_REACTION)
        assertThat(queued.targetId).isEqualTo("m1")
        assertThat(queued.payload).contains("❤️")
    }

    @Test
    fun `removing a reaction decrements it and drops the emoji at zero`() = runHarnessTest { harness ->
        harness.seedSynced(message().copy(reactionSummary = mapOf("❤️" to 1, "🔥" to 3)))

        writer(harness).toggleReactionOptimistic("m1", "❤️", isAdding = false)

        assertThat(harness.cachedMessage("m1").reactionSummary).containsExactly("🔥", 3)
        assertThat(harness.outbox.deliverable(OutboxLanes.REACTION).single().kindEnum)
            .isEqualTo(OutboxKind.REMOVE_REACTION)
    }

    @Test
    fun `the last reaction removed leaves no summary at all`() = runHarnessTest { harness ->
        harness.seedSynced(message().copy(reactionSummary = mapOf("❤️" to 1)))

        writer(harness).toggleReactionOptimistic("m1", "❤️", isAdding = false)

        assertThat(harness.cachedMessage("m1").reactionSummary).isNull()
    }

    @Test
    fun `a quick add then remove of the same reaction annihilates in the outbox`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val writer = writer(harness)

        writer.toggleReactionOptimistic("m1", "❤️", isAdding = true)
        writer.toggleReactionOptimistic("m1", "❤️", isAdding = false)

        assertThat(harness.outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
        assertThat(harness.cachedMessage("m1").reactionSummary).isNull()
    }

    @Test
    fun `a socket reaction delta moves the cached summary without touching the outbox`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        writer(harness).applyReactionDelta("m1", "🔥", delta = 2)

        assertThat(harness.cachedMessage("m1").reactionSummary).containsExactly("🔥", 2)
        assertThat(harness.outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
    }

    @Test
    fun `a socket reaction delta also lands on a message that is still unsent`() = runHarnessTest { harness ->
        harness.seedUnsent("cid_1")

        writer(harness).applyReactionDelta("cid_1", "🔥", delta = 1)

        assertThat(harness.cachedMessage("cid_1").reactionSummary).containsExactly("🔥", 1)
    }

    @Test
    fun `an edit rewrites the cached content, purges its translations and queues EDIT_MESSAGE`() = runHarnessTest { harness ->
        harness.seedSynced(
            message().copy(
                translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "hi there")),
            ),
        )

        val applied = writer(harness).editOptimistic("m1", "bonjour")

        assertThat(applied).isTrue()
        val edited = harness.cachedMessage("m1")
        assertThat(edited.content).isEqualTo("bonjour")
        assertThat(edited.isEdited).isTrue()
        assertThat(edited.translations).isEmpty()
        val queued = harness.outbox.deliverable("message:c1").single()
        assertThat(queued.kindEnum).isEqualTo(OutboxKind.EDIT_MESSAGE)
        assertThat(queued.targetId).isEqualTo("m1")
        assertThat(queued.payload).contains("bonjour")
    }

    @Test
    fun `a delete leaves a tombstone stamped at the clock instant and queues DELETE_MESSAGE`() = runHarnessTest { harness ->
        harness.seedSynced(
            message().copy(
                translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "hi there")),
            ),
        )

        val applied = writer(harness).deleteOptimistic("m1")

        assertThat(applied).isTrue()
        val tombstone = harness.cachedMessage("m1")
        assertThat(tombstone.content).isEmpty()
        assertThat(tombstone.translations).isEmpty()
        assertThat(tombstone.deletedAt).isEqualTo(Instant.ofEpochMilli(harness.clock.now).toString())
        val queued = harness.outbox.deliverable("message:c1").single()
        assertThat(queued.kindEnum).isEqualTo(OutboxKind.DELETE_MESSAGE)
        assertThat(queued.targetId).isEqualTo("m1")
        assertThat(queued.payload).isEqualTo("{}")
    }

    @Test
    fun `pinning stamps pinnedAt at the clock instant and queues PIN_MESSAGE with its conversation`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val applied = writer(harness).setPinnedOptimistic("m1", pin = true)

        assertThat(applied).isTrue()
        assertThat(harness.cachedMessage("m1").pinnedAt).isEqualTo(Instant.ofEpochMilli(harness.clock.now).toString())
        val queued = harness.outbox.deliverable(OutboxLanes.PIN).single()
        assertThat(queued.kindEnum).isEqualTo(OutboxKind.PIN_MESSAGE)
        assertThat(queued.targetId).isEqualTo("m1")
        assertThat(queued.payload).contains("c1")
    }

    @Test
    fun `unpinning clears pinnedAt and queues UNPIN_MESSAGE`() = runHarnessTest { harness ->
        harness.seedSynced(message().copy(pinnedAt = "2026-07-08T10:00:00Z"))

        val applied = writer(harness).setPinnedOptimistic("m1", pin = false)

        assertThat(applied).isTrue()
        assertThat(harness.cachedMessage("m1").pinnedAt).isNull()
        assertThat(harness.outbox.deliverable(OutboxLanes.PIN).single().kindEnum).isEqualTo(OutboxKind.UNPIN_MESSAGE)
    }

    @Test
    fun `every optimistic mutation refuses a bubble the server does not know yet`() = runHarnessTest { harness ->
        harness.seedUnsent("cid_1")
        val writer = writer(harness)

        assertThat(writer.toggleReactionOptimistic("cid_1", "❤️", isAdding = true)).isFalse()
        assertThat(writer.editOptimistic("cid_1", "changed")).isFalse()
        assertThat(writer.deleteOptimistic("cid_1")).isFalse()
        assertThat(writer.setPinnedOptimistic("cid_1", pin = true)).isFalse()

        val untouched = harness.cachedMessage("cid_1")
        assertThat(untouched.content).isEqualTo("salut")
        assertThat(untouched.deletedAt).isNull()
        assertThat(untouched.pinnedAt).isNull()
        assertThat(untouched.reactionSummary).isNull()
        assertThat(harness.outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
        assertThat(harness.outbox.deliverable(OutboxLanes.PIN)).isEmpty()
        assertThat(harness.outbox.deliverable("message:c1")).isEmpty()
    }

    @Test
    fun `every optimistic mutation refuses a message that is not cached`() = runHarnessTest { harness ->
        val writer = writer(harness)

        assertThat(writer.toggleReactionOptimistic("ghost", "❤️", isAdding = true)).isFalse()
        assertThat(writer.editOptimistic("ghost", "changed")).isFalse()
        assertThat(writer.deleteOptimistic("ghost")).isFalse()
        assertThat(writer.setPinnedOptimistic("ghost", pin = true)).isFalse()
        assertThat(harness.database.messageDao().find("ghost")).isNull()
    }

    @Test
    fun `a mutation keeps the row's identity and only rewrites its payload and what derives from it`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val before: MessageEntity = harness.database.messageDao().find("m1")!!

        writer(harness).editOptimistic("m1", "bonjour")

        val after = harness.database.messageDao().find("m1")!!
        assertThat(after.contentText).isEqualTo("bonjour")
        assertThat(after.changeVersion).isEqualTo(before.changeVersion + 1)
        assertThat(
            after.copy(payload = before.payload, contentText = before.contentText, changeVersion = before.changeVersion),
        ).isEqualTo(before)
    }

    // --- message:edited : la version serveur remplace la copie locale ------

    private fun callNotice(kind: String, outcome: String? = null) = buildJsonObject {
        put("kind", kind)
        if (outcome != null) put("outcome", outcome)
    }

    @Test
    fun `a server edit turning a live call notice terminal rewrites the cached metadata`() = runHarnessTest { harness ->
        harness.seedSynced(message().copy(content = "Appel audio en cours", metadata = callNotice("call-live")))

        val applied = writer(harness).applyServerEdit(
            message().copy(content = "Appel audio manqué", metadata = callNotice("call", outcome = "missed")),
        )

        assertThat(applied).isTrue()
        val cached = harness.cachedMessage("m1")
        assertThat(cached.content).isEqualTo("Appel audio manqué")
        assertThat(cached.metadata?.get("kind")?.jsonPrimitive?.content).isEqualTo("call")
        assertThat(cached.metadata?.get("outcome")?.jsonPrimitive?.content).isEqualTo("missed")
    }

    @Test
    fun `a server edit of a message this device never cached writes nothing`() = runHarnessTest { harness ->
        val applied = writer(harness).applyServerEdit(message("unknown"))

        assertThat(applied).isFalse()
        assertThat(harness.database.messageDao().find("unknown")).isNull()
    }
}
