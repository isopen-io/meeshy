package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class AuthInterceptorCredentialTest {

    private fun send(store: TokenStore, configure: (Request.Builder) -> Unit = {}): okhttp3.mockwebserver.RecordedRequest {
        val server = MockWebServer().apply { enqueue(MockResponse().setBody("{}")); start() }
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(store)).build()
        val builder = Request.Builder().url(server.url("/api/v1/conversations"))
        configure(builder)
        client.newCall(builder.build()).execute().close()
        return server.takeRequest().also { server.shutdown() }
    }

    @Test
    fun `un compte inscrit presente un Bearer et jamais X-Session-Token`() {
        val sent = send(InMemoryTokenStore(jwt = "jwt", sessionToken = "sess"))
        assertThat(sent.getHeader("Authorization")).isEqualTo("Bearer jwt")
        assertThat(sent.getHeader("X-Session-Token")).isNull()
    }

    @Test
    fun `un invite presente X-Session-Token sans Bearer`() {
        val sent = send(InMemoryTokenStore(sessionToken = "anon_1"))
        assertThat(sent.getHeader("X-Session-Token")).isEqualTo("anon_1")
        assertThat(sent.getHeader("Authorization")).isNull()
    }

    @Test
    fun `une requete epinglee garde son jeton fige`() {
        val sent = send(InMemoryTokenStore(jwt = "active")) { it.header("Authorization", "Bearer frozen") }
        assertThat(sent.getHeader("Authorization")).isEqualTo("Bearer frozen")
    }
}
