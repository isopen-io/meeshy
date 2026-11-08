package me.meeshy.sdk.outbox

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.media.FakeUploadLeaseProvider
import me.meeshy.sdk.media.UploadLeaseRunner
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxFlushWorkerUploadLaneTest {

    private class Handler : OutboxKindHandler {
        var sent = 0
        override suspend fun send(row: OutboxEntity): SendResult {
            sent++
            return SendResult.Success
        }
    }

    private fun workerOver(outbox: OutboxRepository, handlers: Map<OutboxKind, OutboxKindHandler>, provider: FakeUploadLeaseProvider): OutboxFlushWorker {
        val registry = MutationSenderRegistry(handlers)
        val factory = object : WorkerFactory() {
            override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                OutboxFlushWorker(
                    appContext, workerParameters, outbox, registry, InMemoryNetworkMonitor(), RecordingOutboxScheduler(),
                    UploadLeaseRunner(providerFor = { provider }),
                )
        }
        return TestListenableWorkerBuilder.from(ApplicationProvider.getApplicationContext<Context>(), OutboxFlushWorker::class.java)
            .setWorkerFactory(factory)
            .build()
    }

    @Test
    fun `the upload lane drains under the lease`() = withOutbox { outbox ->
        val provider = FakeUploadLeaseProvider()
        val upload = Handler()
        outbox.enqueue(OutboxMutation(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "u1", "{}", emptySet(), "upload-u1"))

        val result = workerOver(outbox, mapOf(OutboxKind.UPLOAD_MEDIA to upload), provider).doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(upload.sent).isEqualTo(1)
        assertThat(provider.begins).isEqualTo(1)
        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `a pass without any upload takes no lease`() = withOutbox { outbox ->
        val provider = FakeUploadLeaseProvider()
        val reaction = Handler()
        outbox.enqueue(OutboxMutation(OutboxKind.ADD_REACTION, OutboxLanes.REACTION, "m1", "{}", emptySet(), "r1"))

        workerOver(outbox, mapOf(OutboxKind.ADD_REACTION to reaction), provider).doWork()

        assertThat(reaction.sent).isEqualTo(1)
        assertThat(provider.begins).isEqualTo(0)
    }
}
