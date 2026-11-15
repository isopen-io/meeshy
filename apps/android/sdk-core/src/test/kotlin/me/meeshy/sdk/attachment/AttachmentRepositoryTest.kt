package me.meeshy.sdk.attachment

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.TranscribeRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AttachmentTranslationApi
import me.meeshy.sdk.net.api.MediaApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class AttachmentRepositoryTest {
    private val media = mockk<MediaApi>()
    private val translation = mockk<AttachmentTranslationApi>()
    private val repo = AttachmentRepository(media, translation)

    private fun ok(json: String = "{}") = ApiResponse(success = true, data = Json.parseToJsonElement(json))

    private fun refusal(status: Int, json: String) =
        HttpException(Response.error<Any>(status, json.toResponseBody("application/json".toMediaType())))

    @Test
    fun `transcrire envoie force`() = runTest {
        coEvery { media.transcribe("a1", TranscribeRequest(true)) } returns ok()
        assertThat(repo.transcribe("a1", force = true).isSuccess).isTrue()
        coVerify { media.transcribe("a1", TranscribeRequest(true)) }
    }

    @Test
    fun `traduire rend la reponse decodee`() = runTest {
        coEvery { translation.translate("a1", any()) } returns ok("""{"status":"queued","jobId":"j9"}""")
        val out = repo.translate("a1", listOf("fr")) as AttachmentTranslateOutcome.Success
        assertThat(out.response.jobId).isEqualTo("j9")
    }

    @Test
    fun `un 403 avec consentements devient ConsentRequired`() = runTest {
        coEvery { translation.translate(any(), any()) } throws
            refusal(403, """{"success":false,"error":"m","code":"AUDIO_TRANSLATION_NOT_ENABLED","message":"m","requiredConsents":["voiceDataConsentAt"]}""")
        val out = repo.translate("a1", listOf("fr")) as AttachmentTranslateOutcome.ConsentRequired
        assertThat(out.error.requiredConsents).containsExactly("voiceDataConsentAt")
        assertThat(out.error.code).isEqualTo("AUDIO_TRANSLATION_NOT_ENABLED")
    }

    @Test
    fun `un 403 nu reste un echec ordinaire`() = runTest {
        coEvery { translation.translate(any(), any()) } throws refusal(403, """{"success":false,"error":"ACCESS_DENIED"}""")
        val out = repo.translate("a1", listOf("fr"))
        assertThat(out).isInstanceOf(AttachmentTranslateOutcome.Failed::class.java)
        assertThat((out as AttachmentTranslateOutcome.Failed).error.httpStatus).isEqualTo(403)
    }

    @Test
    fun `le detail de statut liste qui a vu`() = runTest {
        coEvery { media.statusDetails("a1") } returns ApiResponse(
            success = true,
            data = listOf(me.meeshy.sdk.model.AttachmentStatusUser(participantId = "p1", username = "ann")),
        )
        val r = repo.statusDetails("a1") as NetworkResult.Success
        assertThat(r.data.single().username).isEqualTo("ann")
    }

    @Test
    fun `effacer ne depend que du succes de l enveloppe`() = runTest {
        coEvery { media.delete("a1") } returns ApiResponse<JsonElement>(success = true, data = Json.parseToJsonElement("""{"message":"ok"}"""))
        assertThat(repo.delete("a1").isSuccess).isTrue()
    }

    @Test
    fun `effacer refuse remonte l echec`() = runTest {
        coEvery { media.delete("a1") } throws refusal(403, """{"success":false,"error":"x"}""")
        assertThat(repo.delete("a1").isSuccess).isFalse()
    }
}
