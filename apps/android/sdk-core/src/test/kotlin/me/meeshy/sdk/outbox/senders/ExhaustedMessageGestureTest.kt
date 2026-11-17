package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxLanes
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #18915 (M1) — a gesture refused for good gives the message back the SERVER's state, read by its id, whatever its
 * place in the thread. The rollbacks used to refresh the conversation, which only reads its recent window: a pin, an
 * edit or a deletion of an older message stayed on screen as accepted, for the author alone, with no end. Each witness
 * looks at the cached ROW once the outbox row is exhausted the way the drainer leaves it, never at a call.
 */
@RunWith(RobolectricTestRunner::class)
class ExhaustedMessageGestureTest {

    private fun message(id: String, at: String, content: String = "texte $id") =
        ApiMessage(id = id, conversationId = CONVERSATION, senderId = "me", content = content, createdAt = at)

    /** The server's truth: m9 alone in the recent window, m1 (older) read only by its id. */
    private fun gateway(served: ApiMessage): MessageApi = mockk {
        coEvery { listConditional(CONVERSATION, any()) } returns
            Response.success(ApiResponse(success = true, data = listOf(message("m9", T9))))
        coEvery { listAfter(CONVERSATION, any(), any()) } returns
            MessagesApiResponse(success = true, data = emptyList(), cursorPagination = CursorPagination(hasMore = false))
        coEvery { listAround(CONVERSATION, served.id, any()) } returns ApiResponse(success = true, data = listOf(served))
    }

    private fun MessageCollaboratorHarness.repository(api: MessageApi) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
    )

    /** The gesture's single outbox row, exhausted as the drainer leaves it before calling `onExhausted`. */
    private suspend fun MessageCollaboratorHarness.exhausted(lane: String): OutboxEntity {
        val row = outbox.deliverable(lane).single()
        outbox.markExhausted(row.cmid, "refused for good")
        return checkNotNull(outbox.row(row.cmid))
    }

    @Test
    fun `a pin refused for good leaves the old message unpinned, as the server has it`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.seedSynced(message("m9", T9))
        val api = gateway(served = message("m1", T1))
        val repo = harness.repository(api)
        repo.setPinnedOptimistic("m1", pin = true)
        assertThat(harness.cachedMessage("m1").pinnedAt).isNotNull()

        PinMessageHandler(api, repo, senderJson).onExhausted(harness.exhausted(OutboxLanes.PIN))

        assertThat(harness.cachedMessage("m1").pinnedAt).isNull()
    }

    @Test
    fun `an unpin refused for good leaves the old message pinned, as the server has it`() = runHarnessTest { harness ->
        val pinned = message("m1", T1).copy(pinnedAt = T2)
        harness.seedSynced(pinned)
        harness.seedSynced(message("m9", T9))
        val api = gateway(served = pinned)
        val repo = harness.repository(api)
        repo.setPinnedOptimistic("m1", pin = false)
        assertThat(harness.cachedMessage("m1").pinnedAt).isNull()

        UnpinMessageHandler(api, repo, senderJson).onExhausted(harness.exhausted(OutboxLanes.PIN))

        assertThat(harness.cachedMessage("m1").pinnedAt).isEqualTo(T2)
    }

    @Test
    fun `an edit refused for good gives the message back its server text`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1, content = "avant"))
        harness.seedSynced(message("m9", T9))
        val api = gateway(served = message("m1", T1, content = "avant"))
        val repo = harness.repository(api)
        repo.editOptimistic("m1", "après")
        assertThat(harness.cachedMessage("m1").content).isEqualTo("après")

        EditMessageHandler(api, repo, senderJson).onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION)))

        assertThat(harness.cachedMessage("m1").content).isEqualTo("avant")
        assertThat(harness.cachedMessage("m1").isEdited).isFalse()
    }

    @Test
    fun `a deletion refused for good gives the message back its text`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1, content = "bonjour"))
        harness.seedSynced(message("m9", T9))
        val api = gateway(served = message("m1", T1, content = "bonjour"))
        val repo = harness.repository(api)
        repo.deleteOptimistic("m1")
        assertThat(harness.cachedMessage("m1").deletedAt).isNotNull()

        DeleteMessageHandler(api, repo).onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION)))

        assertThat(harness.cachedMessage("m1").deletedAt).isNull()
        assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
        const val T9 = "2026-06-01T19:00:00Z"
    }
}
