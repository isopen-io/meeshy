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
    fun `E2EE_PARTICIPANT_WITHOUT_DEVICE porte les membres sans appareil chiffre, a la racine`() = runTest {
        val error = failureOf(
            refused(409, """{"success":false,"code":"E2EE_PARTICIPANT_WITHOUT_DEVICE","error":"x","withoutDeviceUserIds":["u2"]}"""),
        )
        assertThat(error.code).isEqualTo("E2EE_PARTICIPANT_WITHOUT_DEVICE")
        assertThat(error.withoutDeviceUserIds).containsExactly("u2")
        assertThat(failureOf(refused(409, """{"success":false,"code":"E2EE_PARTICIPANT_WITHOUT_DEVICE"}""")).withoutDeviceUserIds).isEmpty()
    }

    /** #20511 — la raison d'un refus voyage à la racine ; une forme qui n'est pas une chaîne n'emporte pas le refus. */
    @Test
    fun `FLAME_PAUSE_NOT_ALLOWED porte sa raison, a la racine`() = runTest {
        val error = failureOf(refused(409, """{"success":false,"code":"FLAME_PAUSE_NOT_ALLOWED","error":"x","reason":"quarterly-limit"}"""))
        assertThat(error.code).isEqualTo("FLAME_PAUSE_NOT_ALLOWED")
        assertThat(error.reason).isEqualTo("quarterly-limit")
        val odd = failureOf(refused(409, """{"success":false,"code":"FLAME_PAUSE_NOT_ALLOWED","reason":{"why":"x"}}"""))
        assertThat(odd.code).isEqualTo("FLAME_PAUSE_NOT_ALLOWED")
        assertThat(odd.reason).isNull()
        assertThat(failureOf(refused(409, """{"success":false,"code":"INSUFFICIENT_MEESHES"}""")).reason).isNull()
    }

    /** #20182 (5) — une liste mal formée ne fait pas perdre le 409 : seuls les identifiants lisibles restent. */
    @Test
    fun `des membres sans appareil mal formes n'emportent pas le refus`() = runTest {
        val scalar = failureOf(
            refused(409, """{"success":false,"code":"E2EE_PARTICIPANT_WITHOUT_DEVICE","withoutDeviceUserIds":"u2"}"""),
        )
        assertThat(scalar.code).isEqualTo("E2EE_PARTICIPANT_WITHOUT_DEVICE")
        assertThat(scalar.withoutDeviceUserIds).isEmpty()
        val mixed = failureOf(
            refused(409, """{"success":false,"code":"E2EE_PARTICIPANT_WITHOUT_DEVICE","withoutDeviceUserIds":[1,"u3",null,{"id":"u4"},""]}"""),
        )
        assertThat(mixed.code).isEqualTo("E2EE_PARTICIPANT_WITHOUT_DEVICE")
        assertThat(mixed.withoutDeviceUserIds).containsExactly("u3")
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
