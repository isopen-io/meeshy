package me.meeshy.sdk.media

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.model.media.PlaybackStretch
import me.meeshy.sdk.model.media.StretchEnd
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class MediaConsumptionReporterTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val body = AttachmentStatusBody(
        action = "listened", playPositionMs = 9_000, durationMs = 9_000, complete = true,
        stretches = listOf(PlaybackStretch(0, 9_000, StretchEnd.COMPLETED)),
    )

    @Test fun `un rapport est mis en file durable meme sans reseau`() = runTest {
        val outbox: OutboxRepository = mockk(relaxed = true)
        val captured = slot<OutboxMutation>()
        coEvery { outbox.enqueue(capture(captured)) } returns "cmid"
        val reporter = MediaConsumptionReporter(outbox, json, StandardTestDispatcher(testScheduler))

        reporter.report("att1", body)
        testScheduler.advanceUntilIdle()

        assertThat(captured.captured.kind).isEqualTo(OutboxKind.REPORT_ATTACHMENT_STATUS)
        assertThat(captured.captured.lane).isEqualTo(OutboxLanes.MEDIA_STATUS)
        assertThat(captured.captured.targetId).isEqualTo("att1")
        assertThat(json.decodeFromString<AttachmentStatusBody>(captured.captured.payload)).isEqualTo(body)
    }

    @Test fun `les rapports partent dans l'ordre et un rapport sans plage ne porte aucune cle stretches`() = runTest {
        val outbox: OutboxRepository = mockk(relaxed = true)
        val order = mutableListOf<String>()
        val payloads = mutableListOf<String>()
        coEvery { outbox.enqueue(any()) } answers {
            order += firstArg<OutboxMutation>().targetId
            payloads += firstArg<OutboxMutation>().payload
            "c"
        }
        val reporter = MediaConsumptionReporter(outbox, json, StandardTestDispatcher(testScheduler))

        reporter.report("a", body)
        reporter.report("b", body.copy(stretches = emptyList()))
        testScheduler.advanceUntilIdle()

        assertThat(order).containsExactly("a", "b").inOrder()
        assertThat(payloads[1]).doesNotContain("stretches")
    }

    @Test fun `la consommation envoyee met a jour listenedComplete`() = runTest {
        val outbox: OutboxRepository = mockk(relaxed = true)
        val reporter = MediaConsumptionReporter(outbox, json, StandardTestDispatcher(testScheduler))

        reporter.consumptionUpdates.test {
            reporter.report("att1", body)
            testScheduler.advanceUntilIdle()

            assertThat(awaitItem().consumption.listenedComplete).isTrue()
        }
    }

    private fun row(payload: String) = OutboxEntity(
        cmid = "c", lane = OutboxLanes.MEDIA_STATUS, kind = OutboxKind.REPORT_ATTACHMENT_STATUS.name,
        targetId = "att1", payload = payload, dependsOn = null, attempts = 0, state = "PENDING",
        createdAt = 0, updatedAt = 0,
    )

    @Test fun `hors ligne l'envoi est transitoire et le rapport reste en file`() = runTest {
        val api: MediaApi = mockk()
        coEvery { api.reportStatus(any(), any()) } throws IOException("offline")

        val result = ReportAttachmentStatusHandler(api, json)
            .send(row(json.encodeToString(AttachmentStatusBody.serializer(), body)))

        assertThat(result).isEqualTo(SendResult.TransientFailure)
    }

    @Test fun `en ligne le rapport est livre vers la bonne piece jointe`() = runTest {
        val api: MediaApi = mockk()
        coEvery { api.reportStatus("att1", body) } returns ApiResponse(success = true, data = JsonNull)

        val result = ReportAttachmentStatusHandler(api, json)
            .send(row(json.encodeToString(AttachmentStatusBody.serializer(), body)))

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify { api.reportStatus("att1", body) }
    }

    @Test fun `un corps illisible est un echec definitif`() = runTest {
        val result = ReportAttachmentStatusHandler(mockk(), json).send(row("{pas du json"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
