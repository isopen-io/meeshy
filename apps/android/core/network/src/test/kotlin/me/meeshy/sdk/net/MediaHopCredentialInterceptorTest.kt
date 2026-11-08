package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.MediaRequestCredential
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Test

/**
 * #14613 — l'identité d'une requête média se décide À CHAQUE SAUT, sur le client que les lecteurs Media3 et l'export de
 * scène utilisent réellement. OkHttp construit chaque saut depuis la requête de l'appelant et n'en retire de lui-même,
 * vers un autre hôte, que `Authorization` : sans la garde, un `X-Session-Token` ou un `Cookie` posé par l'appelant
 * suivrait une 302 chez un tiers.
 */
class MediaHopCredentialInterceptorTest {

    private fun signedClient(api: MockWebServer, store: TokenStore): OkHttpClient =
        MediaHttpClient.deriveForSignedMedia(OkHttpClient(), emptyList()) { url ->
            MediaRequestCredential.headers(url, api.url("/api/v1/").toString(), store.jwt, store.sessionToken)
        }

    private fun servers(block: (api: MockWebServer, elsewhere: MockWebServer) -> Unit) {
        val api = MockWebServer().apply { start() }
        val elsewhere = MockWebServer().apply { start() }
        try {
            block(api, elsewhere)
        } finally {
            api.shutdown()
            elsewhere.shutdown()
        }
    }

    private fun get(client: OkHttpClient, url: String, vararg callerHeaders: Pair<String, String>) {
        val request = Request.Builder().url(url).apply { callerHeaders.forEach { (name, value) -> header(name, value) } }.build()
        client.newCall(request).execute().close()
    }

    private fun RecordedRequest.identity(): List<String?> =
        listOf(getHeader("Authorization"), getHeader("X-Session-Token"), getHeader("Cookie"))

    @Test
    fun `la route des sons recoit le jeton de session de l invite`() = servers { api, _ ->
        api.enqueue(MockResponse().setBody("son"))

        get(signedClient(api, InMemoryTokenStore(sessionToken = "anon")), api.url("/api/v1/static/son.m4a").toString())

        assertThat(api.takeRequest().getHeader("X-Session-Token")).isEqualTo("anon")
    }

    @Test
    fun `une redirection vers un autre hote ne porte ni le jeton de session ni un cookie`() = servers { api, elsewhere ->
        api.enqueue(MockResponse().setResponseCode(302).setHeader("Location", elsewhere.url("/api/v1/static/son.m4a")))
        elsewhere.enqueue(MockResponse().setBody("son"))

        get(
            signedClient(api, InMemoryTokenStore(sessionToken = "anon")),
            api.url("/api/v1/static/son.m4a").toString(),
            "Cookie" to "compte=a",
        )

        assertThat(api.takeRequest().getHeader("X-Session-Token")).isEqualTo("anon")
        assertThat(elsewhere.takeRequest().identity()).containsExactly(null, null, null)
    }

    @Test
    fun `une redirection vers un autre hote ne porte pas le Bearer d un compte`() = servers { api, elsewhere ->
        api.enqueue(MockResponse().setResponseCode(302).setHeader("Location", elsewhere.url("/api/v1/static/son.m4a")))
        elsewhere.enqueue(MockResponse().setBody("son"))

        get(signedClient(api, InMemoryTokenStore(jwt = "jwt")), api.url("/api/v1/static/son.m4a").toString())

        assertThat(api.takeRequest().getHeader("Authorization")).isEqualTo("Bearer jwt")
        assertThat(elsewhere.takeRequest().identity()).containsExactly(null, null, null)
    }

    @Test
    fun `un jeton pose par l appelant ne part ni vers la route des sons ni apres une redirection`() = servers { api, elsewhere ->
        api.enqueue(MockResponse().setResponseCode(302).setHeader("Location", elsewhere.url("/api/v1/static/son.m4a")))
        elsewhere.enqueue(MockResponse().setBody("son"))

        get(
            signedClient(api, InMemoryTokenStore()),
            api.url("/api/v1/static/son.m4a").toString(),
            "X-Session-Token" to "pose-par-l-appelant",
        )

        assertThat(api.takeRequest().identity()).containsExactly(null, null, null)
        assertThat(elsewhere.takeRequest().identity()).containsExactly(null, null, null)
    }

    @Test
    fun `une adresse de l API hors de la route des sons reste nue, meme si l appelant pose un jeton`() = servers { api, _ ->
        api.enqueue(MockResponse().setBody("clip"))

        get(
            signedClient(api, InMemoryTokenStore(jwt = "jwt")),
            api.url("/api/v1/attachments/file/clip.mp4").toString(),
            "X-Session-Token" to "pose-par-l-appelant",
            "Authorization" to "Bearer pose-par-l-appelant",
        )

        assertThat(api.takeRequest().identity()).containsExactly(null, null, null)
    }
}
