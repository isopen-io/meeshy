package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Audit A1 (#19047) — the drainer marks a refused deletion EXHAUSTED before it settles it, and nothing else ever lifts the
 * tombstone: a process that died in between, or while the server was asked, left a LIVE message « deleted » for good. At
 * the next session, every exhausted deletion of the signed-in account whose settlement never finished is settled again,
 * once.
 */
@RunWith(RobolectricTestRunner::class)
class RefusedDeletionReplayTest {

    private fun message(id: String) =
        ApiMessage(id = id, conversationId = CONVERSATION, senderId = "me", content = "bonjour", createdAt = T1)

    /** The harness's queue, its rows authored by [owner]: the replay attributes a row to its author only. */
    private fun MessageCollaboratorHarness.queueOf(owner: String) =
        OutboxRepository(database, database.outboxDao(), OutboxOwnerSource { owner })

    private fun MessageCollaboratorHarness.repository(api: MessageApi, queue: OutboxRepository) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        queue,
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
    )

    /** The process died between the drainer's EXHAUSTED and the end of the settlement: exhausted, never marked. */
    private suspend fun diedWhileSettling(queue: OutboxRepository) {
        val row = queue.deliverable(OutboxLanes.forMessage(CONVERSATION)).single()
        queue.markExhausted(row.cmid, "Refused: HTTP 403 FORBIDDEN")
    }

    private fun MessageCollaboratorHarness.replay(repo: MessageRepository, signedIn: String): RefusedDeletionReplay {
        val marks = SyncMetaRefusedDeletionMarks(database.syncMetaDao(), clock)
        return RefusedDeletionReplay(
            database.outboxDao(),
            OutboxOwnerSource { signedIn },
            marks,
            DeleteMessageHandler(mockk(relaxed = true), repo, settledMarks = marks),
            Dispatchers.Unconfined,
        )
    }

    @Test
    fun `a refused deletion the process never finished settling gives the live message back at the next session, once`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1"))
            val api = mockk<MessageApi> {
                coEvery { listAround(CONVERSATION, "m1", any()) } returns ApiResponse(success = true, data = listOf(message("m1")))
            }
            val queue = harness.queueOf("me")
            val repo = harness.repository(api, queue)
            repo.deleteOptimistic("m1")
            diedWhileSettling(queue)
            val replay = harness.replay(repo, signedIn = "me")

            assertThat(replay.replay()).isEqualTo(1)
            assertThat(harness.cachedMessage("m1").deletedAt).isNull()
            assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
            assertThat(replay.replay()).isEqualTo(0)
            coVerify(exactly = 1) { api.listAround(CONVERSATION, "m1", any()) }
        }

    @Test
    fun `a refused deletion of another account waits for that account`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1"))
        val api = mockk<MessageApi>(relaxed = true)
        val queue = harness.queueOf("someone")
        val repo = harness.repository(api, queue)
        repo.deleteOptimistic("m1")
        diedWhileSettling(queue)

        assertThat(harness.replay(repo, signedIn = "me").replay()).isEqualTo(0)
        assertThat(harness.cachedMessage("m1").deletedAt).isNotNull()
        coVerify(exactly = 0) { api.listAround(any(), any(), any()) }
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val T1 = "2026-06-01T10:00:00Z"
    }
}
