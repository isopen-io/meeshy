package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class SceneAssetFetcherTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val server = MockWebServer()
    private val fetcher = SceneAssetFetcher(OkHttpClient(), admits = { true })

    @After
    fun stop() = server.shutdown()

    @Test
    fun `le fichier servi est ecrit tel quel`() = runBlocking {
        server.enqueue(MockResponse().setBody(Buffer().writeUtf8("octets")))
        server.start()
        val target = File(folder.root, "a.bin")
        fetcher.fetch(server.url("/m").toString(), target)
        assertThat(target.readText()).isEqualTo("octets")
    }

    @Test
    fun `un statut d erreur n ecrit rien et leve`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(404))
        server.start()
        val target = File(folder.root, "b.bin")
        val failure = runCatching { fetcher.fetch(server.url("/m").toString(), target) }.exceptionOrNull()
        assertThat(failure).isInstanceOf(java.io.IOException::class.java)
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `un telechargement coupe en route ne laisse pas de fichier partiel`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(Buffer().writeUtf8("x".repeat(10_000)))
                .setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY),
        )
        server.start()
        val target = File(folder.root, "c.bin")
        runCatching { fetcher.fetch(server.url("/m").toString(), target) }
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `une adresse refusee ne touche pas le reseau et n ecrit rien`() = runBlocking {
        server.start()
        val refusing = SceneAssetFetcher(OkHttpClient(), admits = { false })
        val target = File(folder.root, "d.bin")
        val failure = runCatching { refusing.fetch(server.url("/m").toString(), target) }.exceptionOrNull()
        assertThat(failure).isInstanceOf(SceneAssetRefusedException::class.java)
        assertThat(server.requestCount).isEqualTo(0)
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `seule l identite rendue pour cette adresse part avec la requete`() = runBlocking {
        server.enqueue(MockResponse().setBody("son"))
        server.start()
        val withCredential = SceneAssetFetcher(
            OkHttpClient(),
            admits = { true },
            headers = { url -> if (url.contains("/static/")) mapOf("Authorization" to "Bearer j") else emptyMap() },
        )
        withCredential.fetch(server.url("/api/v1/static/a.mp3").toString(), File(folder.root, "e.bin"))
        assertThat(server.takeRequest().getHeader("Authorization")).isEqualTo("Bearer j")
        server.enqueue(MockResponse().setBody("fond"))
        withCredential.fetch(server.url("/u/fond.mp4").toString(), File(folder.root, "f.bin"))
        assertThat(server.takeRequest().getHeader("Authorization")).isNull()
    }

    @Test
    fun `un fichier plus lourd que la borne est refuse sans fichier partiel`() = runBlocking {
        server.enqueue(MockResponse().setBody("x".repeat(4_096)))
        server.start()
        val bounded = SceneAssetFetcher(OkHttpClient(), admits = { true }, maxBytes = 1_024)
        val target = File(folder.root, "g.bin")
        val failure = runCatching { bounded.fetch(server.url("/m").toString(), target) }.exceptionOrNull()
        assertThat(failure).isInstanceOf(SceneAssetRefusedException::class.java)
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `sans longueur annoncee la borne tient au fil de la copie`() = runBlocking {
        server.enqueue(MockResponse().setChunkedBody("x".repeat(4_096), 512))
        server.start()
        val bounded = SceneAssetFetcher(OkHttpClient(), admits = { true }, maxBytes = 1_024)
        val target = File(folder.root, "h.bin")
        runCatching { bounded.fetch(server.url("/m").toString(), target) }
        assertThat(target.exists()).isFalse()
    }
}
