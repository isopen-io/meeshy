package me.meeshy.sdk.media

import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import androidx.work.ForegroundInfo
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.delay
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.outbox.MutationSenderRegistry
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.RecordingOutboxScheduler
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withOutbox
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class MediaUploadWorkerTest {

    private class UploadHandler(private val onSend: suspend () -> SendResult) : OutboxKindHandler {
        var sent = 0
        override suspend fun send(row: OutboxEntity): SendResult {
            sent++
            return onSend()
        }
    }

    private val notifier = UploadLeaseNotifier {
        ForegroundInfo(7, NotificationCompat.Builder(ApplicationProvider.getApplicationContext<Context>(), "c").build())
    }

    private fun workerOver(
        outbox: OutboxRepository,
        handler: UploadHandler,
        provider: FakeUploadLeaseProvider,
        scheduler: RecordingOutboxScheduler = RecordingOutboxScheduler(),
    ): MediaUploadWorker {
        val registry = MutationSenderRegistry(mapOf(OutboxKind.UPLOAD_MEDIA to handler))
        val factory = object : WorkerFactory() {
            override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                MediaUploadWorker(appContext, workerParameters, outbox, registry, UploadLeaseRunner(providerFor = { provider }), notifier, scheduler)
        }
        return TestListenableWorkerBuilder.from(ApplicationProvider.getApplicationContext<Context>(), MediaUploadWorker::class.java)
            .setWorkerFactory(factory)
            .build()
    }

    private suspend fun queueUpload(outbox: OutboxRepository) {
        outbox.enqueue(OutboxMutation(OutboxKind.UPLOAD_MEDIA, OutboxLanes.MEDIA, "u1", "{}", emptySet(), "upload-u1"))
    }

    @Test
    fun `the request runs expedited behind a network constraint`() {
        val spec = MediaUploadWorker.buildRequest().workSpec

        assertThat(spec.expedited).isTrue()
        assertThat(spec.constraints.requiredNetworkType).isEqualTo(androidx.work.NetworkType.CONNECTED)
    }

    @Test
    fun `the worker exposes the quiet foreground notification`() = withOutbox { outbox ->
        val worker = workerOver(outbox, UploadHandler { SendResult.Success }, FakeUploadLeaseProvider())

        assertThat(worker.getForegroundInfo().notificationId).isEqualTo(7)
    }

    @Test
    fun `a queued upload is sent under one lease then the messages waiting on it are flushed`() = withOutbox { outbox ->
        val provider = FakeUploadLeaseProvider()
        val handler = UploadHandler { SendResult.Success }
        val scheduler = RecordingOutboxScheduler()
        queueUpload(outbox)

        val result = workerOver(outbox, handler, provider, scheduler).doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(handler.sent).isEqualTo(1)
        assertThat(provider.begins).isEqualTo(1)
        assertThat(provider.ends).isEqualTo(1)
        assertThat(scheduler.nowCount).isEqualTo(1)
    }

    @Test
    fun `nothing to upload means no lease and no notification`() = withOutbox { outbox ->
        val provider = FakeUploadLeaseProvider()

        val result = workerOver(outbox, UploadHandler { SendResult.Success }, provider).doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        assertThat(provider.begins).isEqualTo(0)
    }

    @Test
    fun `a transient failure retries and still ends the lease once`() = withOutbox { outbox ->
        val provider = FakeUploadLeaseProvider()
        queueUpload(outbox)

        val result = workerOver(outbox, UploadHandler { SendResult.TransientFailure }, provider).doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.retry())
        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `the system stopping the upload cancels it keeps the row and retries`() = withOutbox { outbox ->
        val provider = FakeUploadLeaseProvider()
        val handler = UploadHandler {
            provider.expire()
            delay(60_000)
            SendResult.Success
        }
        queueUpload(outbox)

        val result = workerOver(outbox, handler, provider).doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.retry())
        assertThat(provider.ends).isEqualTo(1)
        assertThat(outbox.row("upload-u1")).isNotNull()
    }
}
