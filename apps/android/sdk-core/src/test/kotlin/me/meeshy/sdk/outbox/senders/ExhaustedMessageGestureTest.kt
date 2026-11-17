package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.ChatMutationAdmission
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.MessageIngestPipeline
import me.meeshy.sdk.conversation.MessageMutationsRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.MessageChatRestApi
import me.meeshy.sdk.outbox.OutboxChatLanes
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.SendResult
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
    private suspend fun MessageCollaboratorHarness.exhausted(lane: String, reason: String = "refused for good"): OutboxEntity {
        val row = outbox.deliverable(lane).single()
        outbox.markExhausted(row.cmid, reason)
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

    // — #18953: the four other gestures read the message they touched back by its id, never the conversation's window —

    private fun MessageCollaboratorHarness.mutations(repo: MessageRepository) = MessageMutationsRepository(outbox, repo, senderJson)

    private fun MessageApi.readTheMessageAlone(id: String) {
        coVerify(exactly = 1) { listAround(CONVERSATION, id, any()) }
        coVerify(exactly = 0) { listConditional(any(), any()) }
    }

    @Test
    fun `a hide refused for good gives the old message back its text, read by its id alone`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1, content = "bonjour"))
        harness.seedSynced(message("m9", T9))
        val api = gateway(served = message("m1", T1, content = "bonjour"))
        val repo = harness.repository(api)
        harness.mutations(repo).hideForMe(CONVERSATION, "m1")
        assertThat(harness.cachedMessage("m1").deletedAt).isNotNull()

        HideForMeHandler(mockk(relaxed = true), repo, senderJson).onExhausted(harness.exhausted(OutboxChatLanes.PERSONAL_HIDING))

        assertThat(harness.cachedMessage("m1").deletedAt).isNull()
        assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
        api.readTheMessageAlone("m1")
    }

    @Test
    fun `a moderation removal refused for good gives the old message back its text, read by its id alone`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1", T1, content = "bonjour"))
            harness.seedSynced(message("m9", T9))
            val api = gateway(served = message("m1", T1, content = "bonjour"))
            val repo = harness.repository(api)
            harness.mutations(repo).moderationDelete(CONVERSATION, "m1", "spam")
            assertThat(harness.cachedMessage("m1").deletedAt).isNotNull()

            ModerationDeleteHandler(mockk(relaxed = true), repo, senderJson)
                .onExhausted(harness.exhausted(OutboxChatLanes.CONTENT_REMOVAL))

            assertThat(harness.cachedMessage("m1").deletedAt).isNull()
            assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
            api.readTheMessageAlone("m1")
        }

    @Test
    fun `an attachment removal refused for good gives the piece back, its message read by its id alone`() =
        runHarnessTest { harness ->
            val piece = ApiMessageAttachment(id = "a1", mimeType = "image/jpeg", fileUrl = "https://cdn.example/a1.jpg")
            harness.seedSynced(message("m1", T1))
            harness.seedSynced(message("m9", T9))
            val api = gateway(served = message("m1", T1).copy(attachments = listOf(piece)))
            val repo = harness.repository(api)
            harness.mutations(repo).removeAttachment(CONVERSATION, "m1", "a1")

            RemoveAttachmentHandler(mockk(relaxed = true), repo, senderJson)
                .onExhausted(harness.exhausted(OutboxChatLanes.CONTENT_REMOVAL))

            assertThat(harness.cachedMessage("m1").attachments.map { it.id }).containsExactly("a1")
            api.readTheMessageAlone("m1")
        }

    /** The hidden row left the cache with the server's `message:hidden-for-me`: the accepted restore reads it back by its id. */
    @Test
    fun `a restore the server accepts brings the old message back, read by its id alone`() = runHarnessTest { harness ->
        harness.seedSynced(message("m9", T9))
        val api = gateway(served = message("m1", T1, content = "bonjour"))
        val chat = mockk<MessageChatRestApi> {
            coEvery { restoreForMe("m1", any()) } returns ApiResponse(success = true, data = JsonNull)
        }
        val repo = harness.repository(api)
        harness.mutations(repo).restoreForMe(CONVERSATION, "m1")
        val row = harness.outbox.deliverable(OutboxChatLanes.PERSONAL_HIDING).single()

        val result = RestoreForMeHandler(chat, repo, senderJson).send(row)

        assertThat(result).isEqualTo(SendResult.Success)
        assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
        api.readTheMessageAlone("m1")
    }

    @Test
    fun `a hide its restore cancels while still queued gives the message back, read by its id alone`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1", T1, content = "bonjour"))
            harness.seedSynced(message("m9", T9))
            val api = gateway(served = message("m1", T1, content = "bonjour"))
            val mutations = harness.mutations(harness.repository(api))
            mutations.hideForMe(CONVERSATION, "m1")

            val admission = mutations.restoreForMe(CONVERSATION, "m1")

            assertThat(admission).isEqualTo(ChatMutationAdmission.CANCELLED_OUT)
            assertThat(harness.cachedMessage("m1").deletedAt).isNull()
            assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
            api.readTheMessageAlone("m1")
        }

    // — #19047: a deletion refused for good (404, 410) of a message the server no longer serves; the tombstone stays until the
    //   server proves the message alive —

    private fun sealed(id: String, at: String) =
        message(id, at, content = "[Encrypted]").copy(isEncrypted = true, encryptionMode = "e2ee")

    private fun MessageCollaboratorHarness.erasures() = PlaintextErasureLedger(database, clock) { "me" }

    private suspend fun PlaintextErasureLedger.keys(): List<String> = pending("me", 100).flatMap { it.messageKeys("me") }

    private fun MessageCollaboratorHarness.repository(api: MessageApi, erasures: PlaintextErasureLedger) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
        erasures = erasures,
    )

    /** Around an id it no longer knows, the gateway serves its newest page instead: the message is not in it. */
    private fun gatewayAnswering(around: String, vararg page: ApiMessage): MessageApi = mockk {
        coEvery { listAround(CONVERSATION, around, any()) } returns ApiResponse(success = true, data = page.toList())
    }

    @Test
    fun `a deletion refused in 410 of a message the server no longer serves stays deleted, and its plaintext erasure is recorded`() =
        runHarnessTest { harness ->
            harness.seedSynced(sealed("m1", T1))
            harness.seedSynced(sealed("m9", T9))
            val erasures = harness.erasures()
            val repo = harness.repository(gatewayAnswering("m1", sealed("m9", T9)), erasures)
            repo.deleteOptimistic("m1")

            DeleteMessageHandler(mockk(relaxed = true), repo).onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION)))

            assertThat(harness.cachedMessage("m1").deletedAt).isNotNull()
            assertThat(harness.cachedMessage("m1").content).isEmpty()
            assertThat(erasures.keys()).containsExactly("m1")
        }

    @Test
    fun `a deletion refused of a message the server still serves gives it back, and erases nothing`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", T1))
        harness.seedSynced(sealed("m9", T9))
        val erasures = harness.erasures()
        val repo = harness.repository(gatewayAnswering("m1", sealed("m1", T1)), erasures)
        repo.deleteOptimistic("m1")

        DeleteMessageHandler(mockk(relaxed = true), repo).onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION)))

        assertThat(harness.cachedMessage("m1").deletedAt).isNull()
        assertThat(erasures.keys()).isEmpty()
    }

    /**
     * The read back asks the server with the tombstone still in place: the plaintext of a message deleted on the device
     * never shows again, not even for the time of the read — it comes back only once the server serves the message.
     */
    @Test
    fun `the tombstone holds while the server is asked, and a deleted message never shows during the read back`() =
        runHarnessTest { harness ->
            harness.seedSynced(sealed("m1", T1))
            harness.seedSynced(sealed("m9", T9))
            var deletedWhileAsked: Boolean? = null
            val api = mockk<MessageApi> {
                coEvery { listAround(CONVERSATION, "m1", any()) } coAnswers {
                    deletedWhileAsked = harness.cachedMessage("m1").deletedAt != null
                    ApiResponse(success = true, data = listOf(sealed("m9", T9)))
                }
            }
            val repo = harness.repository(api, harness.erasures())
            repo.deleteOptimistic("m1")

            DeleteMessageHandler(mockk(relaxed = true), repo).onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION)))

            assertThat(deletedWhileAsked).isTrue()
        }

    /** A 404 or a 410 already said the target is gone: a read back that proves nothing does not bring it back. */
    @Test
    fun `a deletion refused in 404 whose read back fails stays deleted, its plaintext kept until a read proves it gone`() =
        runHarnessTest { harness ->
            harness.seedSynced(sealed("m1", T1))
            val erasures = harness.erasures()
            val api = mockk<MessageApi> { coEvery { listAround(CONVERSATION, "m1", any()) } throws IOException("offline") }
            val repo = harness.repository(api, erasures)
            repo.deleteOptimistic("m1")

            DeleteMessageHandler(mockk(relaxed = true), repo)
                .onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION), reason = "Refused: HTTP 404 MESSAGE_NOT_FOUND"))

            assertThat(harness.cachedMessage("m1").deletedAt).isNotNull()
            assertThat(erasures.keys()).isEmpty()
        }

    /**
     * Audit A1 — the settlement starts once the row is EXHAUSTED, and nothing replayed it: interrupted (the worker stopped)
     * while the server was asked, it left a LIVE message « deleted » for good, since no served copy lifts a local tombstone
     * once its deletion left the queue. It now runs out of reach of cancellation, its read bounded in time.
     */
    @Test
    fun `a refused deletion interrupted while the server is asked still gives the live message back`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", T1))
        val asked = CompletableDeferred<Unit>()
        val api = mockk<MessageApi> {
            coEvery { listAround(CONVERSATION, "m1", any()) } coAnswers {
                asked.complete(Unit)
                awaitCancellation()
            }
        }
        val repo = harness.repository(api, harness.erasures())
        repo.deleteOptimistic("m1")
        harness.exhausted(OutboxLanes.forMessage(CONVERSATION))

        coroutineScope {
            val settling = launch(Dispatchers.Default) { repo.settleRefusedDeletion(CONVERSATION, "m1", readBackBudgetMillis = 100) }
            asked.await()
            settling.cancelAndJoin()
        }
        MessageIngestPipeline(harness.database).ingest(listOf(sealed("m1", T1)), harness.clock.now)

        assertThat(harness.cachedMessage("m1").deletedAt).isNull()
    }

    @Test
    fun `a deletion refused whose read back fails proves nothing, and erases nothing`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", T1))
        val erasures = harness.erasures()
        val api = mockk<MessageApi> { coEvery { listAround(CONVERSATION, "m1", any()) } throws IOException("offline") }
        val repo = harness.repository(api, erasures)
        repo.deleteOptimistic("m1")

        DeleteMessageHandler(mockk(relaxed = true), repo).onExhausted(harness.exhausted(OutboxLanes.forMessage(CONVERSATION)))

        assertThat(harness.cachedMessage("m1").deletedAt).isNull()
        assertThat(erasures.keys()).isEmpty()
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
        const val T9 = "2026-06-01T19:00:00Z"
    }
}
