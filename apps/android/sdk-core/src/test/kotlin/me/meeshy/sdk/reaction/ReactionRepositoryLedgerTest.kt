package me.meeshy.sdk.reaction

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.MessageMutationWriter
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ReactionLedger
import me.meeshy.sdk.outbox.OutboxLanes
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Le registre des lignes de réaction, de l'ajout optimiste à l'écho et au retour arrière. */
@RunWith(RobolectricTestRunner::class)
class ReactionRepositoryLedgerTest {

    private fun writer(harness: MessageCollaboratorHarness) =
        MessageMutationWriter(harness.updater, harness.outbox, harness.clock, selfId = { "me" })

    private fun store(harness: MessageCollaboratorHarness) = ReactionRowStore(harness.updater)

    private fun message() = ApiMessage(id = "m1", conversationId = "c1", content = "salut", createdAt = "2026-06-01T10:00:00Z")

    @Test
    fun `an optimistic add persists my row under my user id`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        writer(harness).toggleReactionOptimistic("m1", "❤️", isAdding = true)

        assertThat(store(harness).rows("m1")!!.map { it.participantId }).containsExactly("me")
    }

    @Test
    fun `add then remove cancel locally with no network trip left in the outbox`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val writer = writer(harness)

        writer.toggleReactionOptimistic("m1", "❤️", isAdding = true)
        writer.toggleReactionOptimistic("m1", "❤️", isAdding = false)

        assertThat(store(harness).rows("m1")).isEmpty()
        assertThat(harness.outbox.deliverable(OutboxLanes.REACTION)).isEmpty()
    }

    @Test
    fun `the echo of my own add finds my row and leaves the rows alone`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        writer(harness).toggleReactionOptimistic("m1", "❤️", isAdding = true)

        val changed = store(harness).record("m1", "❤️", adding = true, participantId = "p-me", ownerUserId = "me", currentUserId = "me", aggregate = null)

        assertThat(changed).isFalse()
        assertThat(store(harness).rows("m1")).hasSize(1)
    }

    @Test
    fun `a third party echo is kept under its participant id and bounded by the aggregate`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val store = store(harness)

        assertThat(store.record("m1", "🔥", true, "p-bob", "bob", "me", ReactionLedger.Aggregate(1, listOf("p-bob")))).isTrue()
        assertThat(store.record("m1", "🔥", true, "p-eve", "eve", "me", ReactionLedger.Aggregate(1, listOf("p-bob")))).isFalse()

        assertThat(store.rows("m1")!!.map { it.participantId }).containsExactly("p-bob")
    }

    @Test
    fun `a refused add is taken back from the rows`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        writer(harness).toggleReactionOptimistic("m1", "❤️", isAdding = true)

        store(harness).setOwn("m1", "❤️", present = false, ownerId = "me")

        assertThat(store(harness).rows("m1")).isEmpty()
    }

    @Test
    fun `a message with no rows yet has none to show`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        assertThat(store(harness).rows("m1")).isNull()
        assertThat(store(harness).rows("unknown")).isNull()
    }
}
