package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Test
import java.util.Base64

class ProactiveRefreshInterceptorTest {

    private fun jwt(expEpochSeconds: Long): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val payload = enc.encodeToString("""{"exp":$expEpochSeconds}""".toByteArray())
        return "h.$payload.s"
    }

    private fun now() = System.currentTimeMillis() / 1000

    private fun run(store: InMemoryTokenStore, path: String, calls: IntArray, newJwt: String = "fresh"): String? {
        val refresher = SessionRefresher(store) { calls[0]++; newJwt }
        val server = MockWebServer().apply { enqueue(MockResponse().setBody("{}")); start() }
        val client = OkHttpClient.Builder()
            .addInterceptor(ProactiveRefreshInterceptor(store, refresher))
            .addInterceptor(AuthInterceptor(store))
            .build()
        client.newCall(Request.Builder().url(server.url("/api/v1$path")).build()).execute().close()
        val sent = server.takeRequest()
        server.shutdown()
        return sent.getHeader("Authorization")
    }

    @Test
    fun `un jwt echu est renouvele avant l envoi sur une route bearer`() {
        val store = InMemoryTokenStore(jwt = jwt(now() - 10), sessionToken = "s", userId = "u1")
        val calls = intArrayOf(0)
        assertThat(run(store, "/conversations", calls)).isEqualTo("Bearer fresh")
        assertThat(calls[0]).isEqualTo(1)
    }

    @Test
    fun `un jwt a moins de 30 secondes de l expiration est renouvele`() {
        val store = InMemoryTokenStore(jwt = jwt(now() + 20), sessionToken = "s", userId = "u1")
        val calls = intArrayOf(0)
        run(store, "/conversations", calls)
        assertThat(calls[0]).isEqualTo(1)
    }

    @Test
    fun `un jwt valide n est pas renouvele`() {
        val valid = jwt(now() + 3600)
        val store = InMemoryTokenStore(jwt = valid, sessionToken = "s", userId = "u1")
        val calls = intArrayOf(0)
        assertThat(run(store, "/conversations", calls)).isEqualTo("Bearer $valid")
        assertThat(calls[0]).isEqualTo(0)
    }

    @Test
    fun `une route d entree d authentification ne declenche jamais de renouvellement`() {
        val store = InMemoryTokenStore(jwt = jwt(now() - 10), sessionToken = "s", userId = "u1")
        val calls = intArrayOf(0)
        run(store, "/auth/login", calls)
        assertThat(calls[0]).isEqualTo(0)
    }
}
