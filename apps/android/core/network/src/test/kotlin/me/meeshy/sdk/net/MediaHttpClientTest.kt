package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaClientRole
import java.nio.file.Files
import okhttp3.Authenticator
import okhttp3.Cache
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import org.junit.Test

/**
 * #14567, #14613 — les clients des médias passent par OkHttp (HTTP/2) sur le pool du client partagé, sans ses
 * intercepteurs d'API : un jeton monté là partirait vers l'hôte qu'une `mediaURL` désigne. Les deux variantes (les
 * pièces du registre de téléchargements, les lecteurs Media3 et l'export de scène) sortent de la MÊME dérivation.
 */
class MediaHttpClientTest {

    private class Marker(val id: String) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response = chain.proceed(chain.request())
    }

    private fun application(id: String) = HttpClientContributor.of(id, PRIORITY) { it.addInterceptor(Marker(id)) }

    private val contributors = listOf(
        HttpClientContributor.granted("session-boundary", PRIORITY, MediaClientRole.SESSION_BOUNDARY) {
            it.addInterceptor(Marker("session-boundary"))
        },
        application("url-guard"),
        application("retry"),
        application("auth"),
        application("device-locale"),
        application("logging"),
        HttpClientContributor.granted("certificate-pinning", PRIORITY, MediaClientRole.CERTIFICATE_PINNING) {
            it.addNetworkInterceptor(Marker("certificate-pinning"))
        },
        HttpClientContributor.of("refresh-authenticator", PRIORITY) { it.authenticator { _, _ -> null } },
    )

    private val shared: OkHttpClient = HttpClientAssembler.build(contributors)

    private fun bothMediaClients(
        from: OkHttpClient = shared,
        with: List<HttpClientContributor> = contributors,
    ): List<OkHttpClient> = listOf(
        MediaHttpClient.derive(from, with, InMemoryTokenStore()) { null },
        MediaHttpClient.deriveForSignedMedia(from, with) { emptyMap() },
    )

    private fun markers(interceptors: List<Interceptor>) = interceptors.filterIsInstance<Marker>().map { it.id }

    @Test
    fun `un client des medias ne garde que la frontiere de session et l epinglage`() {
        bothMediaClients().forEach { media ->
            assertThat(markers(media.interceptors)).containsExactly("session-boundary")
            assertThat(markers(media.networkInterceptors)).containsExactly("certificate-pinning")
        }
    }

    @Test
    fun `un contributeur qui reprend le NOM de l epinglage sans en tenir le role ne monte pas`() {
        val impostor = HttpClientContributor.of("certificate-pinning", PRIORITY) { it.addNetworkInterceptor(Marker("imposteur")) }
        val withImpostor = contributors + impostor

        bothMediaClients(HttpClientAssembler.build(withImpostor), withImpostor).forEach { media ->
            assertThat(markers(media.networkInterceptors)).containsExactly("certificate-pinning")
        }
    }

    @Test
    fun `un contributeur qui delegue a un contributeur garde sans en etre un ne monte pas`() {
        val pinning = contributors.last { it.mediaRole() == MediaClientRole.CERTIFICATE_PINNING }
        val borrower = object : HttpClientContributor by pinning {
            override fun contribute(builder: OkHttpClient.Builder) {
                builder.addNetworkInterceptor(Marker("emprunteur"))
            }
        }
        val withBorrower = contributors + borrower

        bothMediaClients(HttpClientAssembler.build(withBorrower), withBorrower).forEach { media ->
            assertThat(markers(media.networkInterceptors)).containsExactly("certificate-pinning")
        }
    }

    @Test
    fun `un client des medias n herite ni des cookies, ni du cache HTTP, ni du proxy du client partage`() {
        val jar = object : CookieJar {
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = Unit
            override fun loadForRequest(url: HttpUrl): List<Cookie> = emptyList()
        }
        val stateful = shared.newBuilder()
            .cookieJar(jar)
            .cache(Cache(Files.createTempDirectory("media-http").toFile(), 1_024L))
            .proxyAuthenticator { _, _ -> null }
            .build()

        bothMediaClients(stateful).forEach { media ->
            assertThat(media.cookieJar).isSameInstanceAs(CookieJar.NO_COOKIES)
            assertThat(media.cache).isNull()
            assertThat(media.proxyAuthenticator).isSameInstanceAs(Authenticator.NONE)
        }
    }

    @Test
    fun `aucun authentificateur d API ne relance une requete media`() {
        assertThat(shared.authenticator).isNotSameInstanceAs(Authenticator.NONE)
        bothMediaClients().forEach { media -> assertThat(media.authenticator).isSameInstanceAs(Authenticator.NONE) }
    }

    @Test
    fun `un client des medias partage les connexions du client partage, pas sa file d attente`() {
        bothMediaClients().forEach { media ->
            assertThat(media.connectionPool).isSameInstanceAs(shared.connectionPool)
            assertThat(media.dispatcher).isNotSameInstanceAs(shared.dispatcher)
        }
    }

    @Test
    fun `une redirection https vers http n est jamais suivie par un client des medias`() {
        assertThat(shared.followSslRedirects).isTrue()
        bothMediaClients().forEach { media -> assertThat(media.followSslRedirects).isFalse() }
    }

    private companion object {
        const val PRIORITY = 100
    }
}
