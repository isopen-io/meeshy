package me.meeshy.sdk.conversation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MinimalMessageSeed
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Un message reçu par REST, socket et notification donne UNE ligne, et une réception qui ne
 * change rien n'écrit rien : aucun observateur Room ne se réveille, le fil ne recompose pas.
 */
@RunWith(RobolectricTestRunner::class)
class MessageIngestIdempotenceTest {

    private fun pipeline(harness: MessageCollaboratorHarness) = MessageIngestPipeline(harness.database)

    private suspend fun MessageCollaboratorHarness.rows() = database.messageDao().listForConversation("c1")

    private fun payloadOf(json: String): ApiMessage = MeeshyApi.json.decodeFromString<ApiMessage>(json)

    @Test
    fun `the same message received by push, socket and REST yields exactly one rich row`() = runHarnessTest { harness ->
        val minimal = MinimalMessageIngest(harness.database, harness.clock, ConversationRefreshSignal())
        val pipeline = pipeline(harness)

        minimal.ingest(MinimalMessageSeed("m1", "c1", "u1", "salut", IngestFixtures.CREATED_AT))
        pipeline.ingest(listOf(IngestFixtures.socket()), harness.clock.now)
        pipeline.ingest(listOf(IngestFixtures.rest()), harness.clock.now)

        val rows = harness.rows()
        assertThat(rows).hasSize(1)
        val message = payloadOf(rows.single().payload)
        assertThat(message.sender?.displayName).isEqualTo("Ana")
        assertThat(message.attachments.map { it.id }).containsExactly("a1")
        assertThat(message.messageType).isEqualTo("image")
    }

    @Test
    fun `a socket echo after the REST snapshot changes nothing`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(listOf(IngestFixtures.rest()), harness.clock.now)
        val before = harness.rows().single()

        val changed = pipeline.ingest(listOf(IngestFixtures.socket()), harness.clock.now + 1_000)

        assertThat(changed).isEmpty()
        assertThat(harness.rows().single()).isEqualTo(before)
    }

    @Test
    fun `identical upserts produce no Room emission`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(listOf(IngestFixtures.rest()), harness.clock.now)

        harness.database.messageDao().observeRecentForConversation("c1", 50).test {
            assertThat(awaitItem()).hasSize(1)
            repeat(5) { pipeline.ingest(listOf(IngestFixtures.rest()), harness.clock.now + it) }
            pipeline.ingest(listOf(IngestFixtures.socket()), harness.clock.now)
            expectNoEvents()

            pipeline.ingest(listOf(IngestFixtures.rest(deliveredCount = 2)), harness.clock.now)
            assertThat(awaitItem().single().deliveredCount).isEqualTo(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `local columns survive a REST snapshot`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        val dao = harness.database.messageDao()
        pipeline.ingest(listOf(IngestFixtures.rest()), harness.clock.now)
        dao.markViewOnceOpened("m1", openedAt = 77L)
        dao.recordSendAttempt("m1", sendState = null, retryCount = 2, lastError = "timeout")
        val unsent = MessageEntityFactory.local(IngestFixtures.socket(id = "cid_local"), harness.clock.now, LocalSendState.SENDING)
        dao.upsertAll(listOf(unsent))

        pipeline.ingest(listOf(IngestFixtures.rest(deliveredCount = 3)), harness.clock.now)

        val row = dao.find("m1")!!
        assertThat(row.deliveredCount).isEqualTo(3)
        assertThat(row.viewOnceOpenedAt).isEqualTo(77L)
        assertThat(row.retryCount).isEqualTo(2)
        assertThat(row.lastError).isEqualTo("timeout")
        assertThat(dao.find("cid_local")!!.sendState).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `an older REST snapshot never regresses the row`() = runHarnessTest { harness ->
        val pipeline = pipeline(harness)
        pipeline.ingest(
            listOf(IngestFixtures.rest(content = "v2", deliveredCount = 3, editedAt = "2026-06-01T10:10:00Z")),
            harness.clock.now,
        )
        val before = harness.rows().single()

        val changed = pipeline.ingest(
            listOf(IngestFixtures.rest(content = "v1", deliveredCount = 1, editedAt = "2026-06-01T10:05:00Z")),
            harness.clock.now,
        )

        assertThat(changed).isEmpty()
        val after = harness.rows().single()
        assertThat(after.changeVersion).isEqualTo(before.changeVersion)
        assertThat(payloadOf(after.payload).content).isEqualTo("v2")
        assertThat(after.deliveredCount).isEqualTo(3)
    }

    @Test
    fun `the server twin replaces the optimistic bubble in place`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(MessageEntityFactory.local(IngestFixtures.socket(id = "cid_1"), harness.clock.now, LocalSendState.SENDING)))

        pipeline(harness).ingest(listOf(IngestFixtures.rest(id = "srv1").copy(clientMessageId = "cid_1")), harness.clock.now)

        assertThat(harness.rows().map { it.id }).containsExactly("srv1")
        assertThat(dao.find("srv1")!!.sendState).isNull()
    }

    @Test
    fun `a message arriving with its conversation closed is already in Room when it opens`() = runHarnessTest { harness ->
        val received = MutableSharedFlow<ApiMessage>()
        val socket: MessageSocketManager = mockk { every { messageReceived } returns received }
        val signal = ConversationRefreshSignal()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val binding = IncomingMessageIngestBinding(
            socket = socket,
            pipeline = pipeline(harness),
            clock = harness.clock,
            signal = signal,
            scope = scope,
            windowMillis = 500L,
        )
        try {
            signal.changes.test {
                binding.attach()
                received.subscriptionCount.first { it > 0 }
                repeat(50) { index -> received.emit(IngestFixtures.socket(id = "m$index", conversationId = "c${index % 5}")) }

                assertThat(awaitItem()).containsExactly("c0", "c1", "c2", "c3", "c4")
                expectNoEvents()
                cancelAndIgnoreRemainingEvents()
            }
            assertThat(harness.database.messageDao().listForConversation("c3")).hasSize(10)
        } finally {
            binding.detach()
            scope.cancel()
        }
    }
}
