package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.UpgradeRequirement
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.util.concurrent.TimeUnit

class UpgradeRequiredInterceptorTest {
    private fun run(code: Int, body: String): List<UpgradeRequirement> {
        val seen = mutableListOf<UpgradeRequirement>()
        val request = Request.Builder().url("https://gate.meeshy.me/api/v1/conversations").build()
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
        val out = UpgradeRequiredInterceptor { seen += it }.intercept(chain)
        assertThat(out.code).isEqualTo(code)
        assertThat(out.peekBody(4096).string()).isEqualTo(body)
        return seen
    }

    @Test
    fun `un 426 signale la rupture avec le plancher et le store servis`() {
        val body = """{"success":false,"code":"UPGRADE_REQUIRED","minVersion":"2.1.0","storeUrl":"https://play.google.com/store/apps/details?id=me.meeshy.app"}"""
        assertThat(run(426, body)).containsExactly(
            UpgradeRequirement("2.1.0", "https://play.google.com/store/apps/details?id=me.meeshy.app"),
        )
    }

    @Test
    fun `un 426 au corps illisible signale quand meme une rupture nue`() {
        assertThat(run(426, "<html>")).containsExactly(UpgradeRequirement("", null))
        assertThat(run(426, "")).containsExactly(UpgradeRequirement("", null))
    }

    @Test
    fun `aucun autre statut ne ferme l application`() {
        val body = """{"code":"UPGRADE_REQUIRED","minVersion":"2.1.0"}"""
        listOf(200, 400, 401, 403, 410, 429, 500, 503).forEach { assertThat(run(it, body)).isEmpty() }
    }
}
