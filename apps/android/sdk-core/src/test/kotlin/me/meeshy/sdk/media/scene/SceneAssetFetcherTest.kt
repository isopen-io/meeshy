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
    private val fetcher = SceneAssetFetcher(OkHttpClient())

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
}
