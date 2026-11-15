package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.EndpointAuthKind
import me.meeshy.sdk.model.net.EndpointRetryPolicy
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class EndpointPolicyInterceptorTest {

    private fun probe(path: String, tokens: TokenStore = InMemoryTokenStore(jwt = "jwt-1")): Pair<Request, okhttp3.mockwebserver.RecordedRequest> {
        val server = MockWebServer().apply { enqueue(MockResponse()); start() }
        var seen: Request? = null
        val client = OkHttpClient.Builder()
            .addInterceptor(EndpointPolicyInterceptor())
            .addInterceptor(Interceptor { chain -> seen = chain.request(); chain.proceed(chain.request()) })
            .addInterceptor(AuthInterceptor(tokens))
            .build()
        try {
            client.newCall(Request.Builder().url(server.url(path)).build()).execute().close()
            return checkNotNull(seen) to server.takeRequest()
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `la politique de la route est attachee a la requete`() {
        val (request, _) = probe("/api/v1/signal/keys")
        assertThat(request.routePolicy().retryPolicy).isEqualTo(EndpointRetryPolicy.NEVER)
    }

    @Test
    fun `une route sans authentification part sans identite`() {
        val (_, recorded) = probe("/api/v1/auth/refresh")
        assertThat(recorded.getHeader("Authorization")).isNull()
    }

    @Test
    fun `une route d'identifiants part sans identite`() {
        val (request, recorded) = probe("/api/v1/auth/login")
        assertThat(request.routePolicy().authKind).isEqualTo(EndpointAuthKind.CREDENTIALS)
        assertThat(recorded.getHeader("Authorization")).isNull()
    }

    @Test
    fun `le reste part en bearer`() {
        val (_, recorded) = probe("/api/v1/conversations")
        assertThat(recorded.getHeader("Authorization")).isEqualTo("Bearer jwt-1")
    }
}
