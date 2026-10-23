package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertThrows
import org.junit.Test

class UrlGuardInterceptorTest {

    private fun attempt(path: String, ok: (MockWebServer) -> Unit) {
        val server = MockWebServer().apply { enqueue(MockResponse().setResponseCode(200)); start() }
        val client = OkHttpClient.Builder().addInterceptor(UrlGuardInterceptor()).build()
        try {
            ok(server)
            client.newCall(Request.Builder().url(server.url(path)).build()).execute().close()
        } finally {
            server.shutdown()
        }
    }

    private fun refused(path: String) {
        val server = MockWebServer().apply { start() }
        val client = OkHttpClient.Builder().addInterceptor(UrlGuardInterceptor()).build()
        try {
            val error = assertThrows(InvalidUrlException::class.java) {
                client.newCall(Request.Builder().url(server.url(path)).build()).execute()
            }
            assertThat(error.message).contains("URL invalide")
            assertThat(server.requestCount).isEqualTo(0)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `un segment vide est refuse avant tout appel reseau`() = refused("/api/v1/conversations//messages")

    @Test
    fun `un double slash est refuse`() = refused("/api/v1//conversations")

    @Test
    fun `un slash final est refuse`() = refused("/api/v1/conversations/")

    @Test
    fun `un chemin valide part`() = attempt("/api/v1/conversations") { }

    @Test
    fun `le refus remonte en ApiError URL invalide`() {
        val failure = ioApiError(InvalidUrlException("/a//b"))
        assertThat(failure.code).isEqualTo("INVALID_URL")
        assertThat(failure.message).isEqualTo("URL invalide")
    }
}
