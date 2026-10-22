package me.meeshy.app.push.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException

class PushMediaFetcherTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val ok = "https://gate.meeshy.me/files/a.jpg"

    private class Fake(val respond: (okhttp3.Request) -> Response) {
        val requests = mutableListOf<okhttp3.Request>()
        val client: OkHttpClient = OkHttpClient.Builder().addInterceptor(
            Interceptor { chain ->
                requests += chain.request()
                respond(chain.request())
            },
        ).build()
    }

    private fun reply(
        request: okhttp3.Request,
        bytes: ByteArray,
        code: Int = 200,
        declaredLength: Long? = null,
    ): Response = Response.Builder()
        .request(request).protocol(Protocol.HTTP_1_1).code(code).message("x")
        .apply { declaredLength?.let { header("Content-Length", it.toString()) } }
        .body(bytes.toResponseBody("image/jpeg".toMediaType()))
        .build()

    private fun fetcher(fake: Fake) = PushMediaFetcher(fake.client, tmp.newFolder())

    private suspend fun PushMediaFetcher.go(
        url: String = ok,
        mime: String = "image/jpeg",
        size: Long? = null,
        data: Map<String, Any?> = emptyMap(),
        budget: Long = 5_000,
    ) = fetch(url, mime, size, data, budget)

    @Test
    fun `une image de confiance est telechargee sur disque`() = runTest {
        val fake = Fake { reply(it, ByteArray(100) { 1 }) }
        val file = fetcher(fake).go()
        assertThat(file).isNotNull()
        assertThat(file!!.length()).isEqualTo(100L)
    }

    @Test
    fun `un hote voisin est refuse sans aucune requete`() = runTest {
        val fake = Fake { reply(it, ByteArray(1)) }
        assertThat(fetcher(fake).go(url = "https://meeshy.me.evil.com/a.jpg")).isNull()
        assertThat(fake.requests).isEmpty()
    }

    @Test
    fun `un message protege ne declenche aucune requete`() = runTest {
        val fake = Fake { reply(it, ByteArray(1)) }
        assertThat(fetcher(fake).go(data = mapOf("effectFlags" to "4"))).isNull()
        assertThat(fake.requests).isEmpty()
    }

    @Test
    fun `une video ou une taille declaree trop grande ne declenche aucune requete`() = runTest {
        val fake = Fake { reply(it, ByteArray(1)) }
        assertThat(fetcher(fake).go(mime = "video/mp4")).isNull()
        assertThat(fetcher(fake).go(size = 9L * 1024 * 1024)).isNull()
        assertThat(fake.requests).isEmpty()
    }

    @Test
    fun `un corps plus gros qu annonce est refuse et le fichier temporaire supprime`() = runTest {
        val dir = tmp.newFolder()
        val fake = Fake { reply(it, ByteArray(8 * 1024 * 1024 + 10)) }
        val result = PushMediaFetcher(fake.client, dir).go(size = 1_000)
        assertThat(result).isNull()
        assertThat(dir.listFiles()!!.toList()).isEmpty()
    }

    @Test
    fun `un Content-Length au dela du plafond est refuse`() = runTest {
        val fake = Fake { reply(it, ByteArray(10), declaredLength = 50L * 1024 * 1024) }
        assertThat(fetcher(fake).go()).isNull()
    }

    @Test
    fun `un statut en erreur echoue en silence`() = runTest {
        val fake = Fake { reply(it, ByteArray(10), code = 404) }
        assertThat(fetcher(fake).go()).isNull()
    }

    @Test
    fun `une exception reseau echoue en silence`() = runTest {
        val fake = Fake { throw IOException("boom") }
        assertThat(fetcher(fake).go()).isNull()
    }

    @Test
    fun `une redirection vers un hote non fiable est refusee`() = runTest {
        val fake = Fake {
            val evil = it.newBuilder().url("https://evil.com/a.jpg").build()
            reply(evil, ByteArray(10))
        }
        assertThat(fetcher(fake).go()).isNull()
    }

    @Test
    fun `un budget epuise ne telecharge rien`() = runTest {
        val fake = Fake { reply(it, ByteArray(10)) }
        assertThat(fetcher(fake).go(budget = 0)).isNull()
        assertThat(fake.requests).isEmpty()
    }
}
