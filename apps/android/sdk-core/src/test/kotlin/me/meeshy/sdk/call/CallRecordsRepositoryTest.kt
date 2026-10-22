package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.CallRecordingLink
import me.meeshy.sdk.model.call.CallRecordingLinkRequest
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

/** Le dépôt des traces d'un appel : session relue, transcription, enregistrement rattaché. */
class CallRecordsRepositoryTest {

    private val api: CallApi = mockk()
    private val repository = CallRecordsRepository(api)

    private val session = ActiveCallSession(id = "call-1", conversationId = "conv-1", mode = "p2p", status = "ended")

    @Test
    fun `details relays the served session`() = runTest {
        coEvery { api.details("call-1") } returns ApiResponse(success = true, data = session)

        assertThat(repository.details("call-1")).isEqualTo(NetworkResult.Success(session))
    }

    @Test
    fun `details propagates a network failure instead of throwing`() = runTest {
        coEvery { api.details("call-1") } throws IOException("offline")

        val result = repository.details("call-1")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("NETWORK")
    }

    @Test
    fun `transcript asks for the requested page`() = runTest {
        val page = CallTranscriptPage(callId = "call-1", conversationId = "conv-1", total = 120, hasMore = true)
        coEvery { api.transcript("call-1", 100, 100) } returns ApiResponse(success = true, data = page)

        val result = repository.transcript("call-1", offset = 100)

        assertThat(result).isEqualTo(NetworkResult.Success(page))
    }

    /** La passerelle plafonne à 100 : le dépôt ne demande jamais plus, ni un rang négatif. */
    @Test
    fun `transcript clamps the page window to what the gateway serves`() = runTest {
        val page = CallTranscriptPage(callId = "call-1", conversationId = "conv-1")
        coEvery { api.transcript("call-1", 0, 100) } returns ApiResponse(success = true, data = page)

        repository.transcript("call-1", offset = -5, limit = 500)

        coVerify(exactly = 1) { api.transcript("call-1", 0, 100) }
    }

    @Test
    fun `a transcript refused to a non participant is a failure carrying the status`() = runTest {
        val refusal = """{"success":false,"error":"NOT_A_PARTICIPANT"}""".toResponseBody(null)
        coEvery { api.transcript(any(), any(), any()) } throws HttpException(Response.error<Any>(403, refusal))

        val result = repository.transcript("call-1")

        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(403)
    }

    @Test
    fun `a blank call id never reaches the network`() = runTest {
        val result = repository.transcript("  ")

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(CallRecordsRepository.INVALID_ARGUMENT)
        coVerify(exactly = 0) { api.transcript(any(), any(), any()) }
        coVerify(exactly = 0) { api.details(any()) }
    }

    @Test
    fun `linking a recording posts the attachment id to the recording route`() = runTest {
        val link = CallRecordingLink(recordingId = "r1", messageId = "m1", attachmentId = "a1", kind = "audio")
        coEvery { api.linkRecording("call-1", "r1", CallRecordingLinkRequest("a1")) } returns
            ApiResponse(success = true, data = link)

        val result = repository.linkRecording("call-1", "r1", "a1")

        assertThat(result).isEqualTo(NetworkResult.Success(link))
    }

    @Test
    fun `linking a recording needs all three identifiers`() = runTest {
        val result = repository.linkRecording("call-1", recordingId = "", attachmentId = "a1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { api.linkRecording(any(), any(), any()) }
    }
}
