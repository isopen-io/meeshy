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

    private fun workerOver(outbox: OutboxRepository, handlers: Map<OutboxKind, OutboxKindHandler>): OutboxFlushWorker {
        val registry = MutationSenderRegistry(handlers)
        val factory = object : WorkerFactory() {
            override fun createWorker(
                appContext: Context,
                workerClassName: String,
                workerParameters: WorkerParameters,
            ): ListenableWorker = OutboxFlushWorker(appContext, workerParameters, outbox, registry)
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
    fun `a transient failure asks WorkManager to retry the pass`() = withOutbox { outbox ->
        val worker = workerOver(outbox, mapOf(OutboxKind.BLOCK_USER to RecordingHandler(SendResult.TransientFailure)))
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.retry())
        assertThat(outbox.stateOf("b1")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `a row left in flight by a killed process is replayed`() = withOutbox { outbox ->
        val block = RecordingHandler()
        val worker = workerOver(outbox, mapOf(OutboxKind.BLOCK_USER to block))
        outbox.enqueue(mutation(OutboxKind.BLOCK_USER, OutboxLanes.BLOCK, "u1", cmid = "b1"))
        outbox.markInflight("b1")

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(block.sent.map { it.cmid }).containsExactly("b1")
    }

    @Test
    fun `a dependent held behind its upload retries once and completes on the next pass`() = withOutbox { outbox ->
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

        val first = worker.doWork()
        val second = worker.doWork()

        assertThat(first).isEqualTo(ListenableWorker.Result.retry())
        assertThat(second).isEqualTo(ListenableWorker.Result.success())
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
