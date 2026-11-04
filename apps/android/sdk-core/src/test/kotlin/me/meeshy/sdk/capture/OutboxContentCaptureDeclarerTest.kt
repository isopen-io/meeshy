package me.meeshy.sdk.capture

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.chat.ContentCaptureSending
import me.meeshy.sdk.model.ContentCaptureKind
import me.meeshy.sdk.model.ContentCaptureRefusal
import me.meeshy.sdk.model.ContentCaptureReport
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxScheduler
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class OutboxContentCaptureDeclarerTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val report = ContentCaptureReport("c1", listOf("0123456789abcdef01234567"), ContentCaptureKind.SCREENSHOT, "cap_12345678")

    private fun row(attempts: Int = 0, payload: String = json.encodeToString(ReportContentCapturePayload.serializer(), ReportContentCapturePayload.of(report))) =
        OutboxEntity(
            cmid = "c", lane = OutboxLanes.CAPTURE, kind = OutboxKind.REPORT_CONTENT_CAPTURE.name,
            targetId = "c1", payload = payload, dependsOn = null, attempts = attempts, state = "PENDING",
            createdAt = 0, updatedAt = 0,
        )

    private fun handler(result: Result<List<String>>): ReportContentCaptureHandler {
        val sender = mockk<ContentCaptureSending>()
        coEvery { sender.send(any()) } returns result
        return ReportContentCaptureHandler(sender, json)
    }

    @Test
    fun `a declaration is queued durably then the flush fires after the read settle delay`() = runTest {
        val outbox = mockk<OutboxRepository>(relaxed = true)
        val queued = mutableListOf<OutboxMutation>()
        coEvery { outbox.enqueue(capture(queued)) } returns "cmid"
        val scheduler = mockk<OutboxScheduler>(relaxed = true)

        OutboxContentCaptureDeclarer(outbox, json, scheduler, StandardTestDispatcher(testScheduler)).declare(listOf(report))
        testScheduler.runCurrent()

        assertThat(queued.single().kind).isEqualTo(OutboxKind.REPORT_CONTENT_CAPTURE)
        assertThat(queued.single().lane).isEqualTo(OutboxLanes.CAPTURE)
        assertThat(queued.single().targetId).isEqualTo("c1")
        assertThat(json.decodeFromString<ReportContentCapturePayload>(queued.single().payload).report()).isEqualTo(report)
        verify(exactly = 0) { scheduler.flushNow() }

        testScheduler.advanceTimeBy(OutboxContentCaptureDeclarer.READ_SETTLE_DELAY_MS + 1)
        testScheduler.runCurrent()

        verify(exactly = 1) { scheduler.flushNow() }
    }

    @Test
    fun `nothing to declare queues nothing and flushes nothing`() = runTest {
        val outbox = mockk<OutboxRepository>(relaxed = true)
        val scheduler = mockk<OutboxScheduler>(relaxed = true)

        OutboxContentCaptureDeclarer(outbox, json, scheduler, StandardTestDispatcher(testScheduler)).declare(emptyList())
        testScheduler.advanceUntilIdle()

        verify(exactly = 0) { scheduler.flushNow() }
    }

    @Test
    fun `a judged and noticed declaration leaves the queue`() = runTest {
        assertThat(handler(Result.success(listOf("0123456789abcdef01234567"))).send(row())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `a message judged but not yet noticed is replayed then counted done after two attempts`() = runTest {
        assertThat(handler(Result.success(emptyList())).send(row(attempts = 0))).isEqualTo(SendResult.TransientFailure)
        assertThat(handler(Result.success(emptyList())).send(row(attempts = 2))).isEqualTo(SendResult.Success)
    }

    @Test
    fun `rate limited is replayed and costs an attempt`() = runTest {
        val limited = Result.failure<List<String>>(ContentCaptureRefusal(ContentCaptureRefusal.RATE_LIMITED))
        assertThat(handler(limited).send(row(attempts = 5))).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a final refusal makes the row leave for good`() = runTest {
        listOf(ContentCaptureRefusal.NOT_A_PARTICIPANT, "CONVERSATION_CLOSED", "HTTP_410", "HTTP_422").forEach {
            val result = handler(Result.failure(ContentCaptureRefusal(it))).send(row())
            assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        }
    }

    @Test
    fun `an outage keeps the row and costs no attempt`() = runTest {
        assertThat(handler(Result.failure(IOException("offline"))).send(row())).isEqualTo(SendResult.TransportFailure)
    }

    @Test
    fun `an unreadable payload is a permanent failure`() = runTest {
        assertThat(handler(Result.success(emptyList())).send(row(payload = "{nope"))).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
