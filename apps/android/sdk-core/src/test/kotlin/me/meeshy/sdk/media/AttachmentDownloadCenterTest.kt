package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.model.media.AttachmentDownloadEvent
import me.meeshy.sdk.model.media.DownloadHaptic
import me.meeshy.sdk.model.media.DownloadOrigin
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

class AttachmentDownloadCenterTest {
    @get:Rule val folder = TemporaryFolder()

    private val server = MockWebServer().apply { start() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val haptics = CopyOnWriteArrayList<DownloadHaptic>()
    private val body = ByteArray(40_000) { (it % 251).toByte() }
    private val category = MediaCacheCategory.IMAGES

    private val cache by lazy { TypedMediaCache(MediaCacheDirs(folder.root, folder.root)) }
    private val center by lazy {
        AttachmentDownloadCenter(
            fetcher = MediaFetcher(cache, MediaFileDownloader(OkHttpClient()), scope),
            cache = cache,
            scope = scope,
            haptics = DownloadHaptics { haptics += it },
        )
    }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
    }

    private val url get() = server.url("/u/photo.jpg").toString()

    private fun slow(response: MockResponse = MockResponse()) = response.setBody(okio.Buffer().write(body)).throttleBody(10_000, 100, TimeUnit.MILLISECONDS)

    private fun <T> blocking(block: suspend () -> T): T = runBlocking { withTimeout(15_000) { block() } }

    private suspend fun eventually(check: () -> Boolean) {
        while (!check()) delay(10)
    }

    @Test
    fun `deux demandes d'une meme cle partagent un seul transfert, une progression et une fin`() = blocking {
        server.enqueue(slow())
        val seen = CopyOnWriteArrayList<AttachmentDownloadEvent>()
        val collector = scope.launch(start = CoroutineStart.UNDISPATCHED) { center.events(center.key(url)).collect { seen += it } }
        center.start(url, body.size.toLong(), category, DownloadOrigin.AUTOMATIC)
        center.start(url, body.size.toLong(), category, DownloadOrigin.AUTOMATIC)
        val end = center.awaitEnd(center.key(url))
        eventually { seen.any { it is AttachmentDownloadEvent.Finished } }
        collector.cancel()
        assertThat(end).isEqualTo(AttachmentDownloadEvent.Finished(body.size.toLong()))
        assertThat(server.requestCount).isEqualTo(1)
        assertThat(seen.filterIsInstance<AttachmentDownloadEvent.Finished>()).hasSize(1)
        assertThat(seen.filterIsInstance<AttachmentDownloadEvent.Progress>()).isNotEmpty()
        assertThat(cache.file(category, url)?.readBytes()).isEqualTo(body)
        assertThat(center.active.value).isEmpty()
    }

    @Test
    fun `une cle deja sur disque se termine sans reseau`() = blocking {
        server.shutdown()
        val staged = java.io.File(cache.stagingDir(category), "pre").apply { writeBytes(body) }
        cache.store(category, url, staged)
        center.start(url, 0, category, DownloadOrigin.AUTOMATIC)
        val end = center.awaitEnd(center.key(url))
        assertThat(end == null || end == AttachmentDownloadEvent.Finished(body.size.toLong())).isTrue()
        assertThat(center.isInTypedStore(category, url)).isTrue()
    }

    @Test
    fun `l'annulation vaut pour toutes les surfaces et ne laisse rien sur disque`() = blocking {
        server.enqueue(slow())
        val key = center.key(url)
        center.start(url, body.size.toLong(), category, DownloadOrigin.MANUAL)
        val waiting = scope.launch(start = CoroutineStart.UNDISPATCHED) { center.awaitEnd(key) }
        center.cancel(url)
        waiting.join()
        assertThat(center.progress(key)).isNull()
        delay(300)
        assertThat(cache.contains(category, url)).isFalse()
        assertThat(haptics).containsExactly(DownloadHaptic.LIGHT, DownloadHaptic.LIGHT).inOrder()
    }

    @Test
    fun `404 vaut media disparu sans nouvel essai`() = blocking {
        server.enqueue(MockResponse().setResponseCode(404))
        center.start(url, 10, category, DownloadOrigin.AUTOMATIC)
        val end = center.awaitEnd(center.key(url))
        assertThat(end).isEqualTo(AttachmentDownloadEvent.Failed(gone = true))
        assertThat(server.requestCount).isEqualTo(1)
        assertThat(cache.contains(category, url)).isFalse()
    }

    @Test
    fun `no-store ne persiste rien mais le telechargement se termine`() = blocking {
        server.enqueue(MockResponse().setBody(okio.Buffer().write(body)).setHeader("Cache-Control", "private, no-store"))
        center.start(url, body.size.toLong(), category, DownloadOrigin.AUTOMATIC)
        val end = center.awaitEnd(center.key(url))
        assertThat(end).isEqualTo(AttachmentDownloadEvent.Finished(body.size.toLong()))
        assertThat(cache.contains(category, url)).isFalse()
        assertThat(cache.stagingDir(category).listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `un tap vibre au depart et a la fin, une origine automatique reste muette`() = blocking {
        server.enqueue(MockResponse().setBody(okio.Buffer().write(body)))
        center.start(url, body.size.toLong(), category, DownloadOrigin.MANUAL)
        center.awaitEnd(center.key(url))
        eventually { haptics.size == 2 }
        assertThat(haptics).containsExactly(DownloadHaptic.LIGHT, DownloadHaptic.SUCCESS).inOrder()

        haptics.clear()
        val other = server.url("/u/other.jpg").toString()
        server.enqueue(MockResponse().setBody(okio.Buffer().write(body)))
        center.start(other, body.size.toLong(), category, DownloadOrigin.AUTOMATIC)
        center.awaitEnd(center.key(other))
        assertThat(haptics).isEmpty()
    }

    @Test
    fun `un echec reseau d'un tap vibre en erreur`() = blocking {
        server.enqueue(MockResponse().setResponseCode(500))
        center.start(url, 10, category, DownloadOrigin.MANUAL)
        val end = center.awaitEnd(center.key(url))
        assertThat(end).isEqualTo(AttachmentDownloadEvent.Failed(gone = false))
        eventually { haptics.size == 2 }
        assertThat(haptics).containsExactly(DownloadHaptic.LIGHT, DownloadHaptic.ERROR).inOrder()
    }
}
