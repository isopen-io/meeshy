package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.Interceptor
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test
import retrofit2.http.GET

class MeeshyApiCreateCompatibilityTest {

    /** Un jeton qui n'expire pas pendant le test : le renouvellement préventif le laisse partir tel quel. */
    private val LIVE_JWT = "h." + java.util.Base64.getUrlEncoder().withoutPadding()
        .encodeToString("""{"exp":4102444800}""".toByteArray()) + ".s"

    interface Probe {
        @GET("probe")
        suspend fun probe(): okhttp3.ResponseBody
    }

    private fun serving(vararg responses: MockResponse, block: (MockWebServer, MeeshyApi) -> Unit) {
        val server = MockWebServer().apply { responses.forEach(::enqueue); start() }
        try {
            val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString(), socketUrl = "x")
            block(server, MeeshyApi.create(config, InMemoryTokenStore(jwt = LIVE_JWT)) {})
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `l'ancienne signature construit un client avec le socle`() = serving(MockResponse().setBody("ok")) { server, api ->
        kotlinx.coroutines.runBlocking { api.service(Probe::class.java).probe() }

        val request = server.takeRequest()
        assertThat(request.getHeader("Authorization")).isEqualTo("Bearer $LIVE_JWT")
        assertThat(request.path).isEqualTo("/api/v1/probe")
    }

    @Test
    fun `un contributeur supplementaire s'ajoute sans modifier create`() {
        val server = MockWebServer().apply { enqueue(MockResponse().setBody("ok")); start() }
        try {
            val extra = HttpClientContributor.of("probe-header", 1_050) {
                it.addInterceptor(Interceptor { chain ->
                    chain.proceed(chain.request().newBuilder().header("X-Probe", chain.request().header("Authorization") ?: "none").build())
                })
            }
            val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString(), socketUrl = "x")
            val api = MeeshyApi.create(config, InMemoryTokenStore(jwt = LIVE_JWT), extraContributors = listOf(extra))
            kotlinx.coroutines.runBlocking { api.service(Probe::class.java).probe() }

            // priorite 1050 : apres AuthInterceptor (1000), il voit donc deja l'identite.
            assertThat(server.takeRequest().getHeader("X-Probe")).isEqualTo("Bearer $LIVE_JWT")
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `le socle rejoue un 429 sans modification de l'appelant`() =
        serving(MockResponse().setResponseCode(429).addHeader("Retry-After", "0"), MockResponse().setBody("ok")) { server, api ->
            kotlinx.coroutines.runBlocking { api.service(Probe::class.java).probe() }
            assertThat(server.requestCount).isEqualTo(2)
        }
}
