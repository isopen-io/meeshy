package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class RetryInterceptorTest {

    private class Harness(val server: MockWebServer, val client: OkHttpClient, val sleeps: MutableList<Long>) {
        fun get(path: String): Int =
            client.newCall(Request.Builder().url(server.url(path)).build()).execute().use { it.code }
    }

    private fun harness(vararg responses: MockResponse, block: Harness.() -> Unit) {
        val server = MockWebServer().apply { responses.forEach(::enqueue); start() }
        val sleeps = mutableListOf<Long>()
        val client = OkHttpClient.Builder()
            .addInterceptor(EndpointPolicyInterceptor())
            .addInterceptor(RetryInterceptor(sleeper = { sleeps += it }))
            .build()
        try {
            Harness(server, client, sleeps).block()
        } finally {
            server.shutdown()
        }
    }

    private fun status(code: Int, body: String = "", retryAfter: String? = null) =
        MockResponse().setResponseCode(code).setBody(body).apply { retryAfter?.let { addHeader("Retry-After", it) } }

    @Test
    fun `un 429 puis un 200 est rejoue apres Retry-After`() =
        harness(status(429, retryAfter = "2"), status(200)) {
            assertThat(get("/api/v1/conversations")).isEqualTo(200)
            assertThat(server.requestCount).isEqualTo(2)
            assertThat(sleeps).containsExactly(2_000L)
        }

    @Test
    fun `sans Retry-After le delai est 2 puissance tentative secondes`() =
        harness(status(503), status(503), status(503), status(200)) {
            assertThat(get("/api/v1/conversations")).isEqualTo(200)
            assertThat(sleeps).containsExactly(1_000L, 2_000L, 4_000L).inOrder()
        }

    @Test
    fun `trois echecs rejoues puis la quatrieme reponse remonte telle quelle`() =
        harness(status(503), status(503), status(503), status(503), status(200)) {
            assertThat(get("/api/v1/conversations")).isEqualTo(503)
            assertThat(server.requestCount).isEqualTo(4)
        }

    @Test
    fun `Retry-After superieur a 30 s est plafonne`() =
        harness(status(429, retryAfter = "600"), status(200)) {
            get("/api/v1/conversations")
            assertThat(sleeps).containsExactly(30_000L)
        }

    @Test
    fun `un 429 DAILY_COMMENT_LIMIT n'est jamais rejoue`() =
        harness(status(429, """{"success":false,"code":"DAILY_COMMENT_LIMIT"}"""), status(200)) {
            assertThat(get("/api/v1/posts/p/comments")).isEqualTo(429)
            assertThat(server.requestCount).isEqualTo(1)
            assertThat(sleeps).isEmpty()
        }

    @Test
    fun `DAILY_REACTION_LIMIT et NEWCOMER_SLOW_MODE ne sont jamais rejoues`() {
        listOf("DAILY_REACTION_LIMIT", "NEWCOMER_SLOW_MODE").forEach { code ->
            harness(status(429, """{"code":"$code"}"""), status(200)) {
                assertThat(get("/api/v1/x")).isEqualTo(429)
                assertThat(server.requestCount).isEqualTo(1)
            }
        }
    }

    @Test
    fun `une route signal n'est jamais rejouee`() =
        harness(status(503), status(200)) {
            assertThat(get("/api/v1/signal/prekeys")).isEqualTo(503)
            assertThat(server.requestCount).isEqualTo(1)
        }

    @Test
    fun `les autres statuts ne sont pas rejoues`() =
        harness(status(500), status(200)) {
            assertThat(get("/api/v1/conversations")).isEqualTo(500)
            assertThat(server.requestCount).isEqualTo(1)
        }
}
