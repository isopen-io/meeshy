package me.meeshy.sdk.outbox

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxFlushWorkerTest {

    private class RecordingHandler(private val result: SendResult = SendResult.Success) : OutboxKindHandler {
        val sent = mutableListOf<OutboxEntity>()

        override suspend fun send(row: OutboxEntity): SendResult {
            sent += row
            return result
        }
    }

    private fun workerOver(
        outbox: OutboxRepository,
        handlers: Map<OutboxKind, OutboxKindHandler>,
        scheduler: RecordingOutboxScheduler = RecordingOutboxScheduler(),
        network: InMemoryNetworkMonitor = InMemoryNetworkMonitor(),
    ): OutboxFlushWorker {
        val registry = MutationSenderRegistry(handlers)
        val factory = object : WorkerFactory() {
            override fun createWorker(
                appContext: Context,
                workerClassName: String,
                workerParameters: WorkerParameters,
            ): ListenableWorker = OutboxFlushWorker(appContext, workerParameters, outbox, registry, network, scheduler)
        }
        return TestListenableWorkerBuilder.from(
            ApplicationProvider.getApplicationContext<Context>(),
            OutboxFlushWorker::class.java,
        ).setWorkerFactory(factory).build()
    }

    private fun mutation(
        kind: OutboxKind,
        lane: String,
        targetId: String,
        cmid: String = "$kind-$targetId",
        dependsOn: Set<String> = emptySet(),
    ) = OutboxMutation(kind, lane, targetId, "{}", dependsOn, cmid)

    @Test
    fun `the worker drains the message lanes and the shared lanes of the registry then succeeds`() = withOutbox { outbox ->
        val message = RecordingHandler()
        val reaction = RecordingHandler()
        val friend = RecordingHandler()
        val worker = workerOver(
            outbox,
            mapOf(
                OutboxKind.SEND_MESSAGE to message,
                OutboxKind.ADD_REACTION to reaction,
                OutboxKind.SEND_FRIEND_REQUEST to friend,
            ),
        )
        outbox.enqueue(mutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "m1"))
        outbox.enqueue(mutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "m1"))
        outbox.enqueue(mutation(OutboxKind.SEND_FRIEND_REQUEST, OutboxLanes.FRIEND, "u1"))

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(message.sent).hasSize(1)
        assertThat(reaction.sent).hasSize(1)
        assertThat(friend.sent).hasSize(1)
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `a transient failure backs the row off and plans the next pass without a global retry`() = withOutbox { outbox ->
        val scheduler = RecordingOutboxScheduler()
        val worker = workerOver(outbox, mapOf(OutboxKind.BLOCK_USER to RecordingHandler(SendResult.TransientFailure)), scheduler)
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(outbox.stateOf("b1")).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.row("b1")?.nextAttemptAt).isNotNull()
        assertThat(scheduler.plannedDelays).hasSize(1)
        assertThat(scheduler.plannedDelays.single()).isAtLeast(OutboxFlushNext.MIN_DELAY_MS)
    }

    @Test
    fun `offline the worker dispatches nothing and plans its next pass in 60 seconds`() = withOutbox { outbox ->
        val block = RecordingHandler()
        val scheduler = RecordingOutboxScheduler()
        val worker = workerOver(
            outbox,
            mapOf(OutboxKind.BLOCK_USER to block),
            scheduler,
            InMemoryNetworkMonitor(initialOnline = false),
        )
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(block.sent).isEmpty()
        assertThat(scheduler.plannedDelays).containsExactly(OutboxFlushGate.OFFLINE_RETRY_MS)
    }

    @Test
    fun `a row in flight for less than 30 minutes is left alone, it may really be on the wire`() = withOutbox { outbox ->
        val block = RecordingHandler()
        val worker = workerOver(outbox, mapOf(OutboxKind.BLOCK_USER to block))
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))
        outbox.markInflight("b1")

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(block.sent).isEmpty()
        assertThat(outbox.stateOf("b1")).isEqualTo(OutboxState.INFLIGHT)
    }

    @Test
    fun `a dependent held behind its upload leaves in the same pass, without waiting for a retry`() = withOutbox { outbox ->
        val upload = RecordingHandler(SendResult.SuccessWithId("media-1"))
        val message = RecordingHandler()
        val worker = workerOver(
            outbox,
            mapOf(OutboxKind.UPLOAD_MEDIA to upload, OutboxKind.SEND_MESSAGE to message),
        )
        outbox.enqueue(mutation(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "up", cmid = "up-1"))
        outbox.enqueue(
            mutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage("c1"), "m1", "m-1", dependsOn = setOf("up-1")),
        )

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(message.sent.map { it.cmid }).containsExactly("m-1")
    }

    @Test
    fun `an unregistered kind never keeps the worker retrying`() = withOutbox { outbox ->
        val worker = workerOver(outbox, emptyMap())
        outbox.enqueue(mutation(OutboxKind.LIKE_POST, OutboxLanes.SOCIAL, "p1", cmid = "l1"))

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(outbox.stateOf("l1")).isEqualTo(OutboxState.EXHAUSTED)
    }
}
