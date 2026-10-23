package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/** Requêtes du journal d'appels capturées au dernier maillon avant le réseau. */
class CallHistoryEndpointTest {

    private val page = """{"success":true,"data":[],"pagination":{"hasMore":false}}"""

    @Test
    fun `history sends filter type q cursor and limit`() = runTest {
        val http = RecordingHttp(responseBody = page)

        http.serve(CallHistoryApi::class.java)
            .history(cursor = "c9", limit = 50, filter = "missed", type = "video", q = "zoe")

        val request = http.only
        assertThat(request.method).isEqualTo("GET")
        assertThat(request.path).isEqualTo("/api/v1/calls/history")
        assertThat(request.queryParameter("filter")).isEqualTo("missed")
        assertThat(request.queryParameter("type")).isEqualTo("video")
        assertThat(request.queryParameter("q")).isEqualTo("zoe")
        assertThat(request.queryParameter("cursor")).isEqualTo("c9")
        assertThat(request.queryParameter("limit")).isEqualTo("50")
    }

    @Test
    fun `history omits type and q when they are not given`() = runTest {
        val http = RecordingHttp(responseBody = page)

        http.serve(CallHistoryApi::class.java).history(filter = "all")

        assertThat(http.only.hasQueryParameter("type")).isFalse()
        assertThat(http.only.hasQueryParameter("q")).isFalse()
        assertThat(http.only.hasQueryParameter("cursor")).isFalse()
    }

    @Test
    fun `hide deletes one row for the reader alone`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"callId":"c1","hidden":true}}""")

        val result = http.serve(CallHistoryApi::class.java).hide("c1")

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/history/c1")
        assertThat(result.data?.hidden).isTrue()
    }

    @Test
    fun `clearAll deletes the whole journal and decodes the count`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"cleared":7}}""")

        val result = http.serve(CallHistoryApi::class.java).clearAll()

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/history")
        assertThat(result.data?.cleared).isEqualTo(7)
    }
}
