package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.model.sync.LiveReceiptsContinuity
import me.meeshy.sdk.net.api.MessageApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * The gateway under `live-receipts` (#19049, `messages-window-validator.ts`): the window's validator is WEAK and
 * ignores the receipt counters — a receipt alone answers 304 to the validator the page was served with.
 */
private class LiveReceiptsGateway(var served: List<ApiMessage>) : MessageApi by mockk<MessageApi>() {
    val validators: MutableList<String?> = mutableListOf()

    val etag: String get() = "W/\"${served.map { listOf(it.id, it.content, it.createdAt) }.hashCode()}\""

    override suspend fun listConditional(
        conversationId: String,
        ifNoneMatch: String?,
    ): Response<ApiResponse<List<ApiMessage>>> {
        validators += ifNoneMatch
        if (ifNoneMatch == etag) return Response.error("".toResponseBody(null), notModified())
        return Response.success(ApiResponse(success = true, data = served), okhttp3.Headers.headersOf("ETag", etag))
    }

    override suspend fun listAfter(conversationId: String, after: String, limit: Int?): MessagesApiResponse =
        MessagesApiResponse(success = true, data = emptyList(), cursorPagination = CursorPagination(hasMore = false))

    private fun notModified(): okhttp3.Response =
        okhttp3.Response.Builder()
            .code(304)
            .message("Not Modified")
            .protocol(okhttp3.Protocol.HTTP_1_1)
            .request(okhttp3.Request.Builder().url("http://localhost/").build())
            .build()
}

/**
 * #19049 — this binary declares `live-receipts`: the socket keeps the receipt counters, so a 304 keeps them too. That
 * holds only while the socket heard every receipt: after a (re)connection the window is read ONCE without its
 * validator, and the receipts missed during the cut are repaired by the 200.
 */
@RunWith(RobolectricTestRunner::class)
class MessageWindowLiveReceiptsTest {

    private fun message(readCount: Int) =
        ApiMessage(id = "m1", conversationId = CONVERSATION, senderId = "me", content = "bonjour", createdAt = T1, readCount = readCount)

    private fun MessageCollaboratorHarness.repository(api: MessageApi, receipts: LiveReceiptsContinuity) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
        receipts = receipts,
    )

    @Test
    fun `after a reconnection the window is read once without its validator, and a receipt missed during the cut is repaired`() =
        runHarnessTest { harness ->
            val gateway = LiveReceiptsGateway(listOf(message(readCount = 0)))
            val continuity = LiveReceiptsContinuity().apply { connected() }
            val repo = harness.repository(gateway, continuity)
            repo.refresh(CONVERSATION)
            repo.refresh(CONVERSATION)
            val weak = gateway.etag

            gateway.served = listOf(message(readCount = 1))
            continuity.connected()
            repo.refresh(CONVERSATION)
            repo.refresh(CONVERSATION)

            assertThat(gateway.validators).containsExactly(null, weak, null, weak).inOrder()
            assertThat(harness.cachedMessage("m1").readCount).isEqualTo(1)
        }

    /** The boundary: without a cut, the 304 keeps the counters the socket keeps — the validator leaves every time. */
    @Test
    fun `while the socket stays connected the window keeps sending its validator`() = runHarnessTest { harness ->
        val gateway = LiveReceiptsGateway(listOf(message(readCount = 0)))
        val continuity = LiveReceiptsContinuity().apply { connected() }
        val repo = harness.repository(gateway, continuity)

        repeat(3) { repo.refresh(CONVERSATION) }

        assertThat(gateway.validators).containsExactly(null, gateway.etag, gateway.etag).inOrder()
    }

    @Test
    fun `each connection of the socket reaches the continuity, and a thread read in full reads in full once more`() = runTest {
        val connections = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val continuity = LiveReceiptsContinuity()
        val binding = LiveReceiptsBinding(connections, continuity, UnconfinedTestDispatcher(testScheduler))
        binding.attach()
        continuity.readInFull(CONVERSATION, continuity.epoch())

        connections.emit(Unit)

        assertThat(continuity.mayRevalidateConditionally(CONVERSATION)).isFalse()
        binding.detach()
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val T1 = "2026-06-01T10:00:00Z"
    }
}
