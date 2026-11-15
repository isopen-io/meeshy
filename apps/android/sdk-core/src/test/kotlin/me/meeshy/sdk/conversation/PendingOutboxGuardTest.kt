package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Un instantané serveur n'annule aucune mutation encore dans l'outbox. */
@RunWith(RobolectricTestRunner::class)
class PendingOutboxGuardTest {

    private val served = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = "salut",
        createdAt = IngestFixtures.CREATED_AT,
        reactionSummary = mapOf("👍" to 1),
    )

    private fun writer(harness: MessageCollaboratorHarness) =
        MessageMutationWriter(harness.updater, harness.outbox, harness.clock)

    private suspend fun MessageCollaboratorHarness.snapshot() =
        MessageIngestPipeline(database).ingest(listOf(served), clock.now)

    private suspend fun MessageCollaboratorHarness.cached(): ApiMessage =
        MeeshyApi.json.decodeFromString<ApiMessage>(database.messageDao().find("m1")!!.payload)

    @Test
    fun `a pending edit survives a REST snapshot`() = runHarnessTest { harness ->
        harness.seedSynced(served)
        writer(harness).editOptimistic("m1", "corrigé")

        harness.snapshot()

        assertThat(harness.cached().content).isEqualTo("corrigé")
        assertThat(harness.cached().isEdited).isTrue()
    }

    @Test
    fun `a pending delete survives a REST snapshot`() = runHarnessTest { harness ->
        harness.seedSynced(served)
        writer(harness).deleteOptimistic("m1")

        harness.snapshot()

        assertThat(harness.cached().deletedAt).isNotNull()
        assertThat(harness.cached().content).isEmpty()
    }

    @Test
    fun `a pending reaction survives a REST snapshot`() = runHarnessTest { harness ->
        harness.seedSynced(served)
        writer(harness).toggleReactionOptimistic("m1", "🔥", isAdding = true)

        harness.snapshot()

        assertThat(harness.cached().reactionSummary).containsExactly("👍", 1, "🔥", 1)
    }

    @Test
    fun `once the outbox has delivered the server truth applies again`() = runHarnessTest { harness ->
        harness.seedSynced(served)
        writer(harness).editOptimistic("m1", "corrigé")
        harness.database.outboxDao().clear()

        harness.snapshot()

        assertThat(harness.cached().content).isEqualTo("salut")
    }

    @Test
    fun `an unreadable outbox is loud and leaves the cache untouched`() = runHarnessTest { harness ->
        harness.seedSynced(served)
        writer(harness).editOptimistic("m1", "corrigé")
        val broken: OutboxDao = mockk { coEvery { pendingTargets(any()) } throws IllegalStateException("disk") }

        val failure = runCatching {
            MessageIngestPipeline(harness.database, PendingOutboxGuard(broken)).ingest(listOf(served), harness.clock.now)
        }.exceptionOrNull()

        assertThat(failure).isInstanceOf(PendingOutboxReadException::class.java)
        assertThat(harness.cached().content).isEqualTo("corrigé")
    }
}
