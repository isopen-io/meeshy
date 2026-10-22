package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.Interceptor
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test
import retrofit2.http.GET
import java.util.Base64

class MeeshyApiCreateCompatibilityTest {

    /** Un JWT lisible qui expire dans une heure : un jeton illisible déclencherait le renouvellement proactif. */
    private val jwt: String = run {
        val enc = Base64.getUrlEncoder().withoutPadding()
        "h.${enc.encodeToString("""{"exp":${System.currentTimeMillis() / 1000 + 3600}}""".toByteArray())}.s"
    }

    interface Probe {
        @GET("probe")
        suspend fun probe(): okhttp3.ResponseBody
    }

    private fun serving(vararg responses: MockResponse, block: (MockWebServer, MeeshyApi) -> Unit) {
        val server = MockWebServer().apply { responses.forEach(::enqueue); start() }
        try {
            val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString(), socketUrl = "x")
            block(server, MeeshyApi.create(config, InMemoryTokenStore(jwt = jwt)) {})
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `l'ancienne signature construit un client avec le socle`() = serving(MockResponse().setBody("ok")) { server, api ->
        kotlinx.coroutines.runBlocking { api.service(Probe::class.java).probe() }

        val request = server.takeRequest()
        assertThat(request.getHeader("Authorization")).isEqualTo("Bearer $jwt")
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
            val api = MeeshyApi.create(config, InMemoryTokenStore(jwt = jwt), extraContributors = listOf(extra))
            kotlinx.coroutines.runBlocking { api.service(Probe::class.java).probe() }

            // priorite 1050 : apres AuthInterceptor (1000), il voit donc deja l'identite.
            assertThat(server.takeRequest().getHeader("X-Probe")).isEqualTo("Bearer $jwt")
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
