package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.media.MediaAvailabilityState
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.concurrent.TimeUnit

class MediaAvailabilityResolverTest {
    @get:Rule val folder = TemporaryFolder()

    private val server = MockWebServer().apply { start() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val body = ByteArray(40_000) { (it % 251).toByte() }
    private val network = InMemoryNetworkConditionMonitor(NetworkCondition.WIFI)

    private val cache by lazy { TypedMediaCache(MediaCacheDirs(folder.root, folder.root)) }
    private val center by lazy {
        AttachmentDownloadCenter(MediaFetcher(cache, MediaFileDownloader(OkHttpClient()), scope), cache, scope)
    }
    private val resolver by lazy { MediaAvailabilityResolver(center, network, scope) }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
    }

    private fun request(path: String = "/u/voice.m4a", kind: MediaKind = MediaKind.AUDIO, optimistic: Boolean = false) =
        MediaRequest(server.url(path).toString(), kind, body.size.toLong(), optimistic)

    private fun <T> blocking(block: suspend () -> T): T = runBlocking { withTimeout(15_000) { block() } }

    private suspend fun eventually(check: () -> Boolean) {
        while (!check()) delay(10)
    }

    private fun slow() = MockResponse().setBody(okio.Buffer().write(body)).throttleBody(10_000, 100, TimeUnit.MILLISECONDS)

    private fun store(request: MediaRequest) = blocking {
        val staged = java.io.File(cache.stagingDir(MediaCacheCategory.AUDIO), "pre").apply { writeBytes(body) }
        cache.store(MediaCacheCategory.AUDIO, request.url, staged)
    }

    @Test
    fun `un fichier en cache est pret au premier rendu meme hors ligne`() {
        val request = request().also(::store)
        network.set(NetworkCondition.OFFLINE)
        assertThat(resolver.atFirstRender(request)).isEqualTo(MediaAvailabilityState.Ready)
    }

    @Test
    fun `un file existant est pret, un file absent est a telecharger`() {
        val present = folder.newFile("a.m4a").apply { writeBytes(body) }
        val ready = MediaRequest(present.toURI().toString(), MediaKind.AUDIO, 10)
        val missing = MediaRequest(java.io.File(folder.root, "none.m4a").toURI().toString(), MediaKind.AUDIO, 10)
        assertThat(resolver.atFirstRender(ready)).isEqualTo(MediaAvailabilityState.Ready)
        assertThat(resolver.atFirstRender(missing)).isInstanceOf(MediaAvailabilityState.NeedsDownload::class.java)
    }

    @Test
    fun `non local et hors ligne donne a telecharger desactive avec la taille`() {
        network.set(NetworkCondition.OFFLINE)
        assertThat(resolver.atFirstRender(request()))
            .isEqualTo(MediaAvailabilityState.NeedsDownload(body.size.toLong(), offline = true))
    }

    @Test
    fun `hors ligne le toucher ne lance rien`() {
        network.set(NetworkCondition.OFFLINE)
        assertThat(resolver.download(request())).isFalse()
        assertThat(server.requestCount).isEqualTo(0)
    }

    @Test
    fun `un media optimiste reste pret meme sans fichier`() {
        val request = MediaRequest("file:///nope.m4a", MediaKind.AUDIO, 10, isOptimistic = true)
        assertThat(resolver.atFirstRender(request)).isEqualTo(MediaAvailabilityState.Ready)
    }

    @Test
    fun `double demande un seul transfert, progression puis pret`() = blocking {
        server.enqueue(slow())
        val request = request()
        assertThat(resolver.download(request)).isTrue()
        assertThat(resolver.download(request)).isFalse()
        assertThat(resolver.atFirstRender(request)).isInstanceOf(MediaAvailabilityState.Downloading::class.java)
        val ready = resolver.observe(request).first { it.isReady }
        assertThat(ready).isEqualTo(MediaAvailabilityState.Ready)
        assertThat(server.requestCount).isEqualTo(1)
    }

    @Test
    fun `echec puis reessai`() = blocking {
        server.enqueue(MockResponse().setResponseCode(500))
        server.enqueue(MockResponse().setBody(okio.Buffer().write(body)))
        val request = request()
        resolver.download(request)
        eventually { resolver.atFirstRender(request) is MediaAvailabilityState.Failed }
        assertThat(resolver.atFirstRender(request)).isEqualTo(MediaAvailabilityState.Failed(false, body.size.toLong()))
        assertThat(resolver.download(request)).isTrue()
        val ready = resolver.observe(request).first { it.isReady }
        assertThat(ready).isEqualTo(MediaAvailabilityState.Ready)
        assertThat(server.requestCount).isEqualTo(2)
    }
}
