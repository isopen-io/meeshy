package me.meeshy.sdk.outbox

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.senders.SendMessageHandler
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The optimistic bubble is reconciled by the worker itself: no ViewModel needs to be alive. */
@RunWith(RobolectricTestRunner::class)
class OutboxFlushWorkerReconcileTest {

    @Test
    fun `a queued send is delivered and reconciled by the worker alone`() = withOutbox { outbox ->
        val request = SendMessageRequest(content = "salut", originalLanguage = "fr", clientMessageId = "cmid-1")
        val server = ApiMessage(id = "srv-1", conversationId = "c1")
        val messageApi = mockk<MessageApi>()
        val messages = mockk<MessageRepository>(relaxed = true)
        coEvery { messageApi.send("c1", request) } returns ApiResponse(success = true, data = server)
        val registry = MutationSenderRegistry(
            mapOf(OutboxKind.SEND_MESSAGE to SendMessageHandler(messageApi, messages, MeeshyApi.json)),
        )
        val factory = object : WorkerFactory() {
            override fun createWorker(
                appContext: Context,
                workerClassName: String,
                workerParameters: WorkerParameters,
            ): ListenableWorker = OutboxFlushWorker(appContext, workerParameters, outbox, registry)
        }
        val worker = TestListenableWorkerBuilder.from(
            ApplicationProvider.getApplicationContext<Context>(),
            OutboxFlushWorker::class.java,
        ).setWorkerFactory(factory).build()
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.SEND_MESSAGE,
                OutboxLanes.forMessage("c1"),
                "c1",
                MeeshyApi.json.encodeToString(request),
                cmid = "cmid-1",
            ),
        )

        val result = worker.doWork()

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
        coVerify(exactly = 1) { messages.reconcileSent("cmid-1", server) }
    }
}
