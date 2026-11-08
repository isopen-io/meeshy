package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test

class SessionRefusalInterceptorTest {
    private fun jwt(userId: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        return "${enc.encodeToString("""{"alg":"HS256"}""".toByteArray())}.${enc.encodeToString("""{"userId":"$userId"}""".toByteArray())}.sig"
    }

    private fun deleted(accountId: String) = """{"success":false,"code":"ACCOUNT_DELETED","accountId":"$accountId"}"""

    private fun run(
        code: Int,
        body: String,
        authorization: String? = null,
        path: String = "conversations",
        requestBody: String? = null,
        notifier: SessionRefusalNotifier = SessionRefusalNotifier(),
    ): SessionRefusalNotifier {
        val builder = Request.Builder().url("https://gate.meeshy.me/api/v1/$path")
        authorization?.let { builder.header("Authorization", it) }
        requestBody?.let { builder.post(it.toRequestBody("application/json".toMediaType())) }
        val request = builder.build()
        val response = Response.Builder()
            .request(request).protocol(Protocol.HTTP_1_1).code(code).message("m")
            .body(body.toResponseBody(null)).build()
        val chain = object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response = response
            override fun connection() = null
            override fun call(): okhttp3.Call = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 0
            override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
            override fun readTimeoutMillis() = 0
            override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
            override fun writeTimeoutMillis() = 0
            override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
        }
        val out = SessionRefusalInterceptor(notifier).intercept(chain)
        assertThat(out.peekBody(1024).string()).isEqualTo(body)
        return notifier
    }

    @Test
    fun `un 401 ACCOUNT_DELETED du proprietaire du jeton pose le compte en attente de retrait et le signale`() {
        val notifier = run(401, deleted("u1"), authorization = "Bearer ${jwt("u1")}")
        assertThat(notifier.isAwaitingRetirement("u1")).isTrue()
    }

    @Test
    fun `un 401 ACCOUNT_DELETED nommant un AUTRE compte que le proprietaire n a aucun effet`() {
        val notifier = run(401, deleted("u2"), authorization = "Bearer ${jwt("u1")}")
        assertThat(notifier.hasPendingRetirement).isFalse()
    }

    @Test
    fun `sans jeton presente aucun compte n est possede`() {
        assertThat(run(401, deleted("u1")).hasPendingRetirement).isFalse()
    }

    @Test
    fun `le refus de auth refresh se possede par le jeton du corps`() {
        val notifier = run(
            401, deleted("u1"), path = "auth/refresh",
            requestBody = """{"token":"${jwt("u1")}","sessionToken":"s"}""",
        )
        assertThat(notifier.isAwaitingRetirement("u1")).isTrue()
    }

    @Test
    fun `un 401 ordinaire ne leve aucun ecran`() {
        val notifier = run(401, """{"success":false,"code":"AUTH_FAILED"}""", authorization = "Bearer ${jwt("u1")}")
        assertThat(notifier.hasPendingRetirement).isFalse()
        assertThat(notifier.ageRefused.value).isFalse()
    }

    @Test
    fun `un 403 AGE_BELOW_MINIMUM leve le signal global`() {
        assertThat(run(403, """{"code":"AGE_BELOW_MINIMUM"}""", authorization = "Bearer ${jwt("u1")}").ageRefused.value).isTrue()
    }

    @Test
    fun `tout autre 403 reste local a l ecran`() {
        assertThat(run(403, """{"code":"FORBIDDEN"}""").ageRefused.value).isFalse()
    }

    @Test
    fun `un succes ne lit pas le corps`() {
        val notifier = run(200, deleted("u1"), authorization = "Bearer ${jwt("u1")}")
        assertThat(notifier.hasPendingRetirement).isFalse()
    }

    @Test
    fun `le retrait accompli leve la mise en attente`() {
        val notifier = run(401, deleted("u1"), authorization = "Bearer ${jwt("u1")}")
        notifier.retirementDone("u1")
        assertThat(notifier.isAwaitingRetirement("u1")).isFalse()
    }
}
