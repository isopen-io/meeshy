package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.net.MaskedEmailOwner
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

class ApiErrorRejectionTest {

    private fun refused(status: Int, body: String, retryAfter: String? = null): HttpException {
        val raw = okhttp3.Response.Builder()
            .request(Request.Builder().url("http://localhost/").build())
            .protocol(okhttp3.Protocol.HTTP_1_1)
            .code(status)
            .message("refused")
            .apply { retryAfter?.let { header("Retry-After", it) } }
            .build()
        return HttpException(Response.error<Unit>(body.toResponseBody("application/json".toMediaTypeOrNull()), raw))
    }

    private suspend fun failureOf(exception: HttpException): ApiError =
        (apiCall<String> { throw exception } as NetworkResult.Failure).error

    @Test
    fun `EMAIL_TAKEN porte le detenteur masque et le champ`() = runTest {
        val error = failureOf(
            refused(
                409,
                """{"success":false,"code":"EMAIL_TAKEN","field":"email","error":"pris",
                    "emailOwner":{"maskedDisplayName":"J*** D***","maskedUsername":"j***e"}}""",
            ),
        )
        assertThat(error.code).isEqualTo("EMAIL_TAKEN")
        assertThat(error.fieldName).isEqualTo("email")
        assertThat(error.emailOwner).isEqualTo(MaskedEmailOwner("J*** D***", "j***e"))
    }

    @Test
    fun `un detenteur mal forme n'emporte pas le refus`() = runTest {
        val error = failureOf(refused(409, """{"success":false,"code":"EMAIL_TAKEN","emailOwner":{"maskedDisplayName":1}}"""))
        assertThat(error.code).isEqualTo("EMAIL_TAKEN")
        assertThat(error.emailOwner).isNull()
    }

    @Test
    fun `une limite du jour porte resetAt, limit et retryAfter`() = runTest {
        val error = failureOf(
            refused(
                429,
                """{"success":false,"code":"DAILY_COMMENT_LIMIT","retryAfter":3600.5,"resetAt":"2026-11-03T22:00:00.000Z","limit":50,"path":"/api/v1/posts/p/comments"}""",
            ),
        )
        assertThat(error.resetAtEpochMillis).isEqualTo(1_793_743_200_000L)
        assertThat(error.limit).isEqualTo(50)
        assertThat(error.retryAfterSeconds).isEqualTo(3601)
    }

    @Test
    fun `le mode lent lit l'en-tete puis l'enveloppe, jamais moins d'une seconde`() = runTest {
        val body = """{"success":false,"code":"NEWCOMER_SLOW_MODE","retryAfter":20}"""
        assertThat(failureOf(refused(429, body, retryAfter = "7")).retryAfterSeconds).isEqualTo(7)
        assertThat(failureOf(refused(429, body)).retryAfterSeconds).isEqualTo(20)
        assertThat(failureOf(refused(429, """{"success":false,"code":"NEWCOMER_SLOW_MODE"}""", retryAfter = "0")).retryAfterSeconds).isEqualTo(1)
    }

    @Test
    fun `un autre 429 ne porte pas de delai de refus`() = runTest {
        val error = failureOf(refused(429, """{"success":false,"code":"RATE_LIMITED","retryAfter":9}""", retryAfter = "9"))
        assertThat(error.retryAfterSeconds).isNull()
    }

    @Test
    fun `un segment de chemin du jeu hors jeu est refuse avant l'envoi`() {
        val server = MockWebServer().apply { start() }
        val client = OkHttpClient.Builder().addInterceptor(UrlGuardInterceptor()).build()
        try {
            val url = server.url("/api/v1/me/game/duo/a%2Fb/accept")
            assertThrows(InvalidUrlException::class.java) { client.newCall(Request.Builder().url(url).build()).execute() }
            assertThat(server.requestCount).isEqualTo(0)
            server.enqueue(MockResponse().setResponseCode(200))
            client.newCall(Request.Builder().url(server.url("/api/v1/me/game/duo/d1/accept")).build()).execute().close()
            assertThat(server.requestCount).isEqualTo(1)
        } finally {
            server.shutdown()
        }
    }
}
