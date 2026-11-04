package me.meeshy.sdk.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ContentCaptureKind
import me.meeshy.sdk.model.ContentCaptureRefusal
import me.meeshy.sdk.model.ContentCaptureReport
import me.meeshy.sdk.model.ContentCaptureResult
import me.meeshy.sdk.net.api.ConversationChatRestApi
import me.meeshy.sdk.socket.ContentCaptureSocketEmitting
import me.meeshy.sdk.socket.EphemeralSocketEvents
import me.meeshy.sdk.socket.AckTransport
import me.meeshy.sdk.socket.SocketAckEmitter
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
class ContentCaptureReporterTest {
    private val report = ContentCaptureReport("c1", listOf("0123456789abcdef01234567"), ContentCaptureKind.SCREENSHOT, "cap_12345678")

    private fun rest(block: (ConversationChatRestApi) -> Unit = {}) = mockk<ConversationChatRestApi>().also(block)

    private fun socket(result: Result<List<String>>) = ContentCaptureSocketEmitting { result }

    @Test
    fun `an acknowledged socket report returns the noticed ids without REST`() = runTest {
        val api = rest()
        val result = ContentCaptureReporter(socket(Result.success(listOf("m1"))), api).send(report)

        assertThat(result.getOrNull()).containsExactly("m1")
        coVerify(exactly = 0) { api.capture(any(), any()) }
    }

    @Test
    fun `a gateway wide refusal is never retried through another transport`() = runTest {
        listOf("UNAUTHENTICATED", "VALIDATION_ERROR", "NOT_A_PARTICIPANT", "RATE_LIMITED", "CONVERSATION_CLOSED").forEach { code ->
            val api = rest()
            val result = ContentCaptureReporter(socket(Result.failure(ContentCaptureRefusal(code))), api).send(report)

            assertThat((result.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo(code)
            coVerify(exactly = 0) { api.capture(any(), any()) }
        }
    }

    @Test
    fun `no socket or a timeout falls back to REST with the same capture id`() = runTest {
        listOf("NO_SOCKET", "TIMEOUT").forEach { code ->
            val api = rest { coEvery { it.capture("c1", any()) } returns ApiResponse(success = true, data = ContentCaptureResult(listOf("m1"))) }
            val result = ContentCaptureReporter(socket(Result.failure(ContentCaptureRefusal(code))), api).send(report)

            assertThat(result.getOrNull()).containsExactly("m1")
            coVerify { api.capture("c1", match { it.captureId == "cap_12345678" && it.kind == "screenshot" }) }
        }
    }

    @Test
    fun `a REST 429 or 403 becomes a final refusal and a 5xx stays a failure`() = runTest {
        fun http(code: Int) = HttpException(Response.error<Any>(code, "{}".toResponseBody("application/json".toMediaType())))
        val offline = socket(Result.failure(ContentCaptureRefusal("NO_SOCKET")))

        val limited = ContentCaptureReporter(offline, rest { coEvery { it.capture(any(), any()) } throws http(429) }).send(report)
        val denied = ContentCaptureReporter(offline, rest { coEvery { it.capture(any(), any()) } throws http(403) }).send(report)
        val closed = ContentCaptureReporter(offline, rest { coEvery { it.capture(any(), any()) } throws http(410) }).send(report)
        val down = ContentCaptureReporter(offline, rest { coEvery { it.capture(any(), any()) } throws http(503) }).send(report)

        assertThat((limited.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo("RATE_LIMITED")
        assertThat((denied.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo("NOT_A_PARTICIPANT")
        assertThat((closed.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo("HTTP_410")
        assertThat(down.exceptionOrNull()).isInstanceOf(HttpException::class.java)
    }

    private class Transport(override val isConnected: Boolean = true, val reply: String?) : AckTransport {
        var event: String? = null
        var sent: JSONObject? = null
        override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
            this.event = event
            sent = data
            reply?.let { ack(arrayOf(JSONObject(it))) }
        }
    }

    private fun events(t: Transport) = EphemeralSocketEvents(SocketAckEmitter(t), timeoutMs = 50)

    @Test
    fun `the socket emits capture-detected and reads noticedMessageIds from the ack`() = runTest {
        val t = Transport(reply = """{"success":true,"data":{"noticedMessageIds":["m1","m2"]}}""")

        val result = events(t).emit(report)

        assertThat(t.event).isEqualTo("message:capture-detected")
        assertThat(t.sent!!.getString("kind")).isEqualTo("screenshot")
        assertThat(t.sent!!.getString("conversationId")).isEqualTo("c1")
        assertThat(t.sent!!.getJSONArray("messageIds").getString(0)).isEqualTo("0123456789abcdef01234567")
        assertThat(result.getOrNull()).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `the socket maps refusal, missing socket, silence and malformed ack`() = runTest {
        val refused = events(Transport(reply = """{"success":false,"code":"CONVERSATION_CLOSED"}""")).emit(report)
        val noSocket = events(Transport(isConnected = false, reply = null)).emit(report)
        val silent = events(Transport(reply = null)).emit(report)
        val malformed = events(Transport(reply = """{"success":true}""")).emit(report)

        assertThat((refused.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo("CONVERSATION_CLOSED")
        assertThat((noSocket.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo("NO_SOCKET")
        assertThat((silent.exceptionOrNull() as ContentCaptureRefusal).code).isEqualTo("TIMEOUT")
        assertThat((malformed.exceptionOrNull() as ContentCaptureRefusal).fallsBackToRest).isTrue()
    }
}
