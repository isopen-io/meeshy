package me.meeshy.app.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.net.HttpClientAssembler
import me.meeshy.sdk.net.HttpClientContributor
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import org.junit.Test

/**
 * #14567 — les médias passent par OkHttp (HTTP/2) sur le pool du client partagé, sans ses intercepteurs d'API : un
 * jeton monté là partirait vers l'hôte qu'une `mediaURL` désigne.
 */
class MediaHttpClientTest {

    private class Marker(val id: String) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response = chain.proceed(chain.request())
    }

    private fun application(id: String) = HttpClientContributor.of(id, PRIORITY) { it.addInterceptor(Marker(id)) }

    private fun network(id: String) = HttpClientContributor.of(id, PRIORITY) { it.addNetworkInterceptor(Marker(id)) }

    private val contributors = listOf(
        application("session-boundary"),
        application("url-guard"),
        application("retry"),
        application("auth"),
        application("device-locale"),
        application("logging"),
        network("certificate-pinning"),
        HttpClientContributor.of("refresh-authenticator", PRIORITY) { it.authenticator { _, _ -> null } },
    )

    private val shared: OkHttpClient = HttpClientAssembler.build(contributors)

    private fun ids(interceptors: List<Interceptor>) = interceptors.map { (it as Marker).id }

    @Test
    fun `le client des medias ne garde que la frontiere de session et l epinglage`() {
        val media = MediaHttpClient.derive(shared, contributors)

        assertThat(ids(media.interceptors)).containsExactly("session-boundary")
        assertThat(ids(media.networkInterceptors)).containsExactly("certificate-pinning")
    }

    @Test
    fun `aucun authentificateur d API ne relance une requete media`() {
        assertThat(shared.authenticator).isNotSameInstanceAs(Authenticator.NONE)
        assertThat(MediaHttpClient.derive(shared, contributors).authenticator).isSameInstanceAs(Authenticator.NONE)
    }

    @Test
    fun `le client des medias partage les connexions du client partage, pas sa file d attente`() {
        val media = MediaHttpClient.derive(shared, contributors)

        assertThat(media.connectionPool).isSameInstanceAs(shared.connectionPool)
        assertThat(media.dispatcher).isNotSameInstanceAs(shared.dispatcher)
    }

    @Test
    fun `une redirection https vers http n est jamais suivie par le client des medias`() {
        assertThat(shared.followSslRedirects).isTrue()
        assertThat(MediaHttpClient.derive(shared, contributors).followSslRedirects).isFalse()
    }

    @Test
    fun `un contributeur inconnu du client partage ne monte pas sur le client des medias`() {
        val withNewcomer = contributors + application("media-auth")

        assertThat(ids(MediaHttpClient.derive(HttpClientAssembler.build(withNewcomer), withNewcomer).interceptors))
            .containsExactly("session-boundary")
    }

    private companion object {
        const val PRIORITY = 100
    }
}
