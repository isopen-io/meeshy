package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.model.socket.SendMessageAck
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #19420 (A4) — an acknowledgement WITHOUT the server's `createdAt` used to leave the row on the DEVICE clock, which the
 * recent window's prune compared with the SERVER instants of the page. A device running five minutes ahead put a live
 * message above the page's cut, and a page that did not serve it declared it gone. A row enters the prune on a server
 * instant only: here the one its ObjectId proves.
 */
@RunWith(RobolectricTestRunner::class)
class AckedBubblePruneTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")
    private val serverNow = Instant.parse("2026-11-01T09:00:00Z")
    private val deviceAheadBy5Minutes = serverNow.plusSeconds(300).toEpochMilli()
    private val ackedId = "6ae6ff90a1b2c3d4e5f60718"

    private fun peer(id: String, at: String) =
        ApiMessage(id = id, conversationId = "c1", senderId = "p_alice", content = "texte $id", createdAt = at)

    private fun serving(vararg messages: ApiMessage, hasMore: Boolean): MessageApi = mockk<MessageApi>().also { api ->
        coEvery { api.listConditional("c1", any()) } returns Response.success(
            ApiResponse(
                success = true,
                data = messages.toList(),
                pagination = Pagination(total = messages.size + 1, offset = 0, limit = messages.size, hasMore = hasMore),
            ),
        )
        coEvery { api.listAfter("c1", any(), any()) } answers {
            val after = isoToEpochMillis(secondArg<String>())
            MessagesApiResponse(
                success = true,
                data = messages.filter { isoToEpochMillis(it.createdAt) > after },
                cursorPagination = CursorPagination(hasMore = false),
            )
        }
    }

    private fun source(harness: MessageCollaboratorHarness, api: MessageApi) = MessageCacheSource(
        "c1", harness.database, harness.database.messageDao(), harness.database.syncMetaDao(), api, harness.clock,
        flowOf(HistoryWindow.Recent(50)),
    )

    private suspend fun MessageCollaboratorHarness.sendAckedWithoutServerClock() {
        val coordinator = MessageSendCoordinator(database, database.messageDao(), outbox, clock)
        val cid = coordinator.sendOptimistic("c1", "bonjour", "fr", sender)
        coordinator.reconcileAcknowledged(cid, SendMessageAck(ackedId, cid, createdAt = null))
    }

    @Test
    fun `an acknowledged row takes its instant from the server id, never from the device clock`() =
        runHarnessTest(deviceAheadBy5Minutes) { harness ->
            harness.sendAckedWithoutServerClock()

            assertThat(harness.database.messageDao().find(ackedId)!!.createdAt).isEqualTo(serverNow.toEpochMilli())
        }

    @Test
    fun `a live acknowledged message older than the page's cut survives a window that does not serve it`() =
        runHarnessTest(deviceAheadBy5Minutes) { harness ->
            harness.sendAckedWithoutServerClock()
            val window = serving(
                peer("m1", "2026-11-01T09:02:00Z"), peer("m2", "2026-11-01T09:03:00Z"), peer("m3", "2026-11-01T09:04:00Z"),
                hasMore = true,
            )

            source(harness, window).revalidate()

            assertThat(harness.database.messageDao().find(ackedId)).isNotNull()
        }
}
