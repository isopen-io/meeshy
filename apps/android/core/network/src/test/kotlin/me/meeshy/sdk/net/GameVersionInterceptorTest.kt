package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.util.concurrent.TimeUnit

class GameVersionInterceptorTest {

    private fun sentHeader(path: String, existing: String? = null): String? {
        var seen: Request? = null
        val request = Request.Builder().url("https://gate.meeshy.me/api/v1/$path")
            .apply { existing?.let { header("X-Meeshy-Game-Version", it) } }.build()
        val chain = object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response {
                seen = request
                return Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("m")
                    .body("".toResponseBody(null)).build()
            }
            override fun connection() = null
            override fun call(): okhttp3.Call = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 0
            override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
            override fun readTimeoutMillis() = 0
            override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
            override fun writeTimeoutMillis() = 0
            override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
        }
        GameVersionInterceptor().intercept(chain)
        return seen!!.header("X-Meeshy-Game-Version")
    }

    @Test
    fun `les routes du jeu portent la version 2`() {
        listOf(
            "me/engagement",
            "me/game/league/week",
            "me/game/seasons/calendar",
            "me/meesh/mint",
            "users/64b000000000000000000001/game",
            "users/64b000000000000000000001/game/showcase",
        ).forEach { assertThat(sentHeader(it)).isEqualTo("2") }
    }

    @Test
    fun `aucune autre route ne porte l en-tete`() {
        listOf(
            "me/preferences",
            "me/engagement-extra",
            "me/game",
            "me/meesh",
            "me/stickers",
            "users/64b000000000000000000001",
            "users/64b000000000000000000001/stats",
            "conversations/abc/game",
            "posts/feed",
        ).forEach { assertThat(sentHeader(it)).isNull() }
    }

    @Test
    fun `un en-tete deja pose n est jamais ecrase`() {
        assertThat(sentHeader("me/engagement", existing = "3")).isEqualTo("3")
    }
}
