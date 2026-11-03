package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Test

class OriginScopedAuthInterceptorTest {

    private fun fetch(
        store: TokenStore,
        apiBase: String?,
        target: (MockWebServer) -> String = { it.url("/u/p.jpg").toString() },
        respond: (MockWebServer) -> MockResponse = { MockResponse().setBody("x") },
    ): RecordedRequest {
        val server = MockWebServer().apply { enqueue(respond(this)); start() }
        val client = OkHttpClient.Builder()
            .addNetworkInterceptor(OriginScopedAuthInterceptor(store) { apiBase ?: server.url("/api/v1/").toString() })
            .build()
        client.newCall(Request.Builder().url(target(server)).build()).execute().close()
        return server.takeRequest().also { server.shutdown() }
    }

    @Test
    fun `la meme origine recoit le Bearer, jamais les deux jetons`() {
        val sent = fetch(InMemoryTokenStore(jwt = "jwt", sessionToken = "sess"), apiBase = null)
        assertThat(sent.getHeader("Authorization")).isEqualTo("Bearer jwt")
        assertThat(sent.getHeader("X-Session-Token")).isNull()
    }

    @Test
    fun `un invite presente X-Session-Token`() {
        val sent = fetch(InMemoryTokenStore(sessionToken = "anon"), apiBase = null)
        assertThat(sent.getHeader("X-Session-Token")).isEqualTo("anon")
        assertThat(sent.getHeader("Authorization")).isNull()
    }

    @Test
    fun `un autre hote reste nu`() {
        val sent = fetch(InMemoryTokenStore(jwt = "jwt", sessionToken = "sess"), apiBase = "https://gate.meeshy.me/api/v1/")
        assertThat(sent.getHeader("Authorization")).isNull()
        assertThat(sent.getHeader("X-Session-Token")).isNull()
    }

    @Test
    fun `un autre port reste nu`() {
        val sent = fetch(InMemoryTokenStore(jwt = "jwt"), apiBase = "http://localhost:1/api/v1/")
        assertThat(sent.getHeader("Authorization")).isNull()
    }

    @Test
    fun `une identite posee par l'appelant vers un tiers est retiree`() {
        val server = MockWebServer().apply { enqueue(MockResponse().setBody("x")); start() }
        val client = OkHttpClient.Builder()
            .addNetworkInterceptor(OriginScopedAuthInterceptor(InMemoryTokenStore(jwt = "jwt")) { "https://gate.meeshy.me/" })
            .build()
        client.newCall(
            Request.Builder().url(server.url("/x")).header("X-Session-Token", "leak").header("Authorization", "Bearer leak").build(),
        ).execute().close()
        val sent = server.takeRequest()
        assertThat(sent.getHeader("X-Session-Token")).isNull()
        assertThat(sent.getHeader("Authorization")).isNull()
        server.shutdown()
    }

    @Test
    fun `les ports implicites sont normalises`() {
        val interceptor = OriginScopedAuthInterceptor(InMemoryTokenStore(jwt = "jwt")) { "https://gate.meeshy.me:443/api/v1/" }
        val sent = mutableListOf<Request>()
        val chain = FakeChain(Request.Builder().url("https://gate.meeshy.me/u/p.jpg").build()) { sent += it }
        interceptor.intercept(chain)
        assertThat(sent.single().header("Authorization")).isEqualTo("Bearer jwt")
    }

    @Test
    fun `une redirection vers un tiers perd l'identite`() {
        val cdn = MockWebServer().apply { enqueue(MockResponse().setBody("bytes")); start() }
        val api = MockWebServer().apply {
            enqueue(MockResponse().setResponseCode(302).setHeader("Location", cdn.url("/file").toString()))
            start()
        }
        val client = OkHttpClient.Builder()
            .addNetworkInterceptor(OriginScopedAuthInterceptor(InMemoryTokenStore(jwt = "jwt", sessionToken = "s")) { api.url("/api/v1/").toString() })
            .build()
        client.newCall(Request.Builder().url(api.url("/u/p.jpg")).build()).execute().close()
        assertThat(api.takeRequest().getHeader("Authorization")).isEqualTo("Bearer jwt")
        val hop = cdn.takeRequest()
        assertThat(hop.getHeader("Authorization")).isNull()
        assertThat(hop.getHeader("X-Session-Token")).isNull()
        api.shutdown(); cdn.shutdown()
    }
}

private class FakeChain(private val request: Request, private val onProceed: (Request) -> Unit) : okhttp3.Interceptor.Chain {
    override fun request(): Request = request
    override fun proceed(request: Request): okhttp3.Response {
        onProceed(request)
        return okhttp3.Response.Builder().request(request).protocol(okhttp3.Protocol.HTTP_1_1).code(200).message("OK").build()
    }
    override fun connection(): okhttp3.Connection? = null
    override fun call(): okhttp3.Call = throw UnsupportedOperationException()
    override fun connectTimeoutMillis(): Int = 0
    override fun withConnectTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
    override fun readTimeoutMillis(): Int = 0
    override fun withReadTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
    override fun writeTimeoutMillis(): Int = 0
    override fun withWriteTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
}
