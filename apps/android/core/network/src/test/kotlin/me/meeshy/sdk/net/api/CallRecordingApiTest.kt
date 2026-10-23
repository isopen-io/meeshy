package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class CallRecordingApiTest {

    private val linked = """{"success":true,"data":{"recordingId":"r1","kind":"audio","messageId":"m1","attachmentId":"a1"}}"""
    private val bubbleMissing = """{"success":false,"error":"bubble","code":"CALL_BUBBLE_MISSING"}"""

    private fun refusing(times: Int, status: Int, body: String): Interceptor {
        val seen = AtomicInteger()
        return Interceptor { chain ->
            if (seen.getAndIncrement() < times) {
                Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(status).message("refused")
                    .body(body.toResponseBody("application/json".toMediaType())).build()
            } else {
                chain.proceed(chain.request())
            }
        }
    }

    private fun api(http: RecordingHttp) = CallRecordingApi(http.serve(CallApi::class.java))

    @Test
    fun `linking posts the attachment id to the recording route`() = runTest {
        val http = RecordingHttp(responseBody = linked)
        val result = api(http).link("c1", "r1", "a1", wait = {})

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/c1/recordings/r1/attachment")
        assertThat(http.only.body).isEqualTo("""{"attachmentId":"a1"}""")
        assertThat((result as NetworkResult.Success).data.messageId).isEqualTo("m1")
    }

    @Test
    fun `a missing bubble is retried after 2 seconds and then succeeds`() = runTest {
        val http = RecordingHttp(responseBody = linked, outer = refusing(2, 409, bubbleMissing))
        val waits = mutableListOf<Long>()

        val result = api(http).link("c1", "r1", "a1", wait = { waits += it })

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(waits).containsExactly(2_000L, 2_000L)
        assertThat(http.requests).hasSize(1)
    }

    @Test
    fun `the third missing bubble gives up`() = runTest {
        val http = RecordingHttp(responseBody = linked, outer = refusing(10, 409, bubbleMissing))
        val waits = mutableListOf<Long>()

        val result = api(http).link("c1", "r1", "a1", wait = { waits += it })

        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(409)
        assertThat(waits).hasSize(2)
    }

    @Test
    fun `another refusal is not retried`() = runTest {
        val http = RecordingHttp(responseBody = linked, outer = refusing(10, 403, """{"success":false,"error":"no","code":"FORBIDDEN"}"""))
        val waits = mutableListOf<Long>()

        val result = api(http).link("c1", "r1", "a1", wait = { waits += it })

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(waits).isEmpty()
    }
}
