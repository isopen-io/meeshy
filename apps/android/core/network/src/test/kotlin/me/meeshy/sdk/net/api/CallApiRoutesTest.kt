package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallMediaSettings
import me.meeshy.sdk.model.call.CallRecordingLinkRequest
import me.meeshy.sdk.model.call.InitiateCallKind
import me.meeshy.sdk.model.call.InitiateCallRequest
import me.meeshy.sdk.model.call.JoinCallRequest
import org.junit.Test

/** Les routes REST d'un appel, telles qu'elles partent — requête capturée derrière le vrai Retrofit. */
class CallApiRoutesTest {

    private val callId = "68b0000000000000000000aa"

    private val session = """
        {"id":"$callId","conversationId":"68b0000000000000000000cc","mode":"p2p","status":"active",
         "metadata":{"type":"video"},
         "participants":[{"userId":"u1","user":{"id":"u1","username":"alice"}}]}
    """.trimIndent()

    private fun sessionResponse() = RecordingHttp(responseBody = """{"success":true,"data":$session}""")

    private fun calls(http: RecordingHttp) = http.serve(CallApi::class.java)

    @Test
    fun `initiating a call posts the conversation and the kind`() = runTest {
        val http = sessionResponse()

        val response = calls(http).initiate(
            InitiateCallRequest(conversationId = "68b0000000000000000000cc", type = InitiateCallKind.VIDEO),
        )

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/calls")
        assertThat(http.only.body)
            .isEqualTo("""{"conversationId":"68b0000000000000000000cc","type":"video"}""")
        assertThat(response.data?.id).isEqualTo(callId)
        assertThat(response.data?.isVideo).isTrue()
    }

    @Test
    fun `initial settings travel under the settings key`() = runTest {
        val http = sessionResponse()

        calls(http).initiate(
            InitiateCallRequest(
                conversationId = "c1",
                type = InitiateCallKind.AUDIO,
                settings = CallMediaSettings(audioEnabled = true, videoEnabled = false),
            ),
        )

        assertThat(http.only.body).isEqualTo(
            """{"conversationId":"c1","type":"audio","settings":{"audioEnabled":true,"videoEnabled":false}}""",
        )
    }

    @Test
    fun `reading a call fetches its session by id`() = runTest {
        val http = sessionResponse()

        val response = calls(http).details(callId)

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/$callId")
        assertThat(response.data?.participants?.single()?.userId).isEqualTo("u1")
    }

    @Test
    fun `ending a call deletes it without a reason by default`() = runTest {
        val http = sessionResponse()

        calls(http).end(callId)

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/$callId")
        assertThat(http.only.hasQueryParameter("reason")).isFalse()
    }

    @Test
    fun `declining a ringing call sends the rejected reason`() = runTest {
        val http = sessionResponse()

        calls(http).end(callId, reason = "rejected")

        assertThat(http.only.queryParameter("reason")).isEqualTo("rejected")
    }

    @Test
    fun `joining a call posts to its participants`() = runTest {
        val http = sessionResponse()

        calls(http).join(callId, JoinCallRequest())

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/$callId/participants")
        assertThat(http.only.body).isEqualTo("{}")
    }

    @Test
    fun `leaving a call deletes the participant entry`() = runTest {
        val http = sessionResponse()

        calls(http).leave(callId, participantId = "u1")

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/$callId/participants/u1")
    }

    @Test
    fun `linking a recording posts the attachment id to the recording route`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"recordingId":"r1","messageId":"m1","attachmentId":"a1","kind":"audio"}}""",
        )

        val response = calls(http).linkRecording(callId, "r1", CallRecordingLinkRequest("a1"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/$callId/recordings/r1/attachment")
        assertThat(http.only.body).isEqualTo("""{"attachmentId":"a1"}""")
        assertThat(response.data?.messageId).isEqualTo("m1")
    }

    @Test
    fun `the transcript is read page by page`() = runTest {
        val http = RecordingHttp(
            responseBody = """
                {"success":true,"data":{"callId":"$callId","conversationId":"c1","total":1,"hasMore":false,
                 "segments":[{"id":"s1","speakerId":"u1","text":"Bonjour","language":"fr","capturedAtMs":1790000000000}]}}
            """.trimIndent(),
        )

        val page = calls(http).transcript(callId, offset = 100, limit = 100).data!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/$callId/transcript")
        assertThat(http.only.queryParameter("offset")).isEqualTo("100")
        assertThat(http.only.queryParameter("limit")).isEqualTo("100")
        assertThat(page.segments.single().text).isEqualTo("Bonjour")
    }

    @Test
    fun `a first transcript page needs no paging parameter`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"callId":"$callId","conversationId":"c1"}}""",
        )

        calls(http).transcript(callId)

        assertThat(http.only.query).isNull()
    }

    @Test
    fun `removing one call from the history targets its own entry`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"callId":"$callId","hidden":true}}""")

        val response = calls(http).removeFromHistory(callId)

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/history/$callId")
        assertThat(response.data?.hidden).isTrue()
    }

    @Test
    fun `clearing the history deletes the whole journal route`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"cleared":7}}""")

        val response = calls(http).clearHistory()

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/calls/history")
        assertThat(response.data?.cleared).isEqualTo(7)
    }
}
