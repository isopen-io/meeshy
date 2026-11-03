package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.net.CertificatePinInterceptor
import me.meeshy.sdk.net.CertificatePinnerContributor
import me.meeshy.sdk.net.HttpClientAssembler
import me.meeshy.sdk.net.HttpClientContributor
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #14877 — l'export d'une scène télécharge ses médias derrière l'épinglage des certificats, comme le client des
 * médias. Il vidait aussi les intercepteurs RÉSEAU, dont l'épinglage est un, alors qu'il joint le jeton du compte pour
 * la route des sons.
 */
class SceneAssetClientTest {

    @get:Rule
    val folder = TemporaryFolder()

    private class Marker : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response = chain.proceed(chain.request())
    }

    private val impostor = HttpClientContributor.of(CertificatePinnerContributor.ID, 1) { it.addNetworkInterceptor(Marker()) }
    private val contributors = setOf(CertificatePinnerContributor.of(), impostor)
    private val client = sceneAssetClient(
        HttpClientAssembler.build(contributors),
        contributors,
        MeeshyConfig(enableLogging = false),
        InMemoryTokenStore(jwt = "jwt"),
    )

    @Test
    fun `l export d une scene telecharge derriere l epinglage des certificats`() {
        assertThat(client.networkInterceptors.filterIsInstance<CertificatePinInterceptor>()).hasSize(1)
    }

    @Test
    fun `un contributeur qui reprend le nom de l epinglage ne monte pas sur le client de l export`() {
        assertThat(client.networkInterceptors.filterIsInstance<Marker>()).isEmpty()
    }

    @Test
    fun `une redirection https vers http n est jamais suivie par le client de l export`() {
        assertThat(client.followSslRedirects).isFalse()
    }

    @Test
    fun `l export pose l identite du compte sur la route des sons, et nulle part ailleurs`() = runBlocking {
        val server = MockWebServer().apply { start() }
        try {
            val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString())
            val fetcher = SceneAssetFetcher(
                sceneAssetClient(OkHttpClient(), emptySet(), config, InMemoryTokenStore(jwt = "jwt")),
                admits = { true },
            )

            server.enqueue(MockResponse().setBody("son"))
            fetcher.fetch(server.url("/api/v1/static/a.mp3").toString(), File(folder.root, "a.bin"))
            assertThat(server.takeRequest().getHeader("Authorization")).isEqualTo("Bearer jwt")

            server.enqueue(MockResponse().setBody("fond"))
            fetcher.fetch(server.url("/u/fond.mp4").toString(), File(folder.root, "b.bin"))
            assertThat(server.takeRequest().getHeader("Authorization")).isNull()
        } finally {
            server.shutdown()
        }
    }
}
