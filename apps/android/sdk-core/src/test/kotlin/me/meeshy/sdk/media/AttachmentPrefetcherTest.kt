package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.media.AttachmentDownloadEvent
import me.meeshy.sdk.model.media.DownloadHaptic
import me.meeshy.sdk.model.media.DownloadOrigin
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

class AttachmentPrefetcherTest {
    @get:Rule val folder = TemporaryFolder()

    private val server = MockWebServer().apply { start() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val haptics = CopyOnWriteArrayList<DownloadHaptic>()
    private val scheduled = CopyOnWriteArrayList<String>()
    private val body = ByteArray(40_000) { 3 }
    private val category = MediaCacheCategory.VIDEO
    private val url get() = server.url("/u/clip.mp4").toString()

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

    private fun slow() = MockResponse().setBody(okio.Buffer().write(body)).throttleBody(10_000, 100, TimeUnit.MILLISECONDS)

    private fun <T> blocking(block: suspend () -> T): T = runBlocking { withTimeout(15_000) { block() } }

    private fun prefetcher(condition: NetworkCondition, policy: AutoDownloadPolicy) = AttachmentPrefetcher(
        center = center,
        preferences = InMemoryMediaDownloadPreferencesStore(MediaDownloadPreferences(video = policy)),
        network = InMemoryNetworkConditionMonitor(condition),
        scheduler = object : DeferredMediaScheduler {
            override fun scheduleUnmetered(url: String, expectedSize: Long, category: MediaCacheCategory) {
                scheduled += url
            }
        },
    )

    @Test
    fun `le prechargement est muet de bout en bout`() = blocking { coroutineScope {
        server.enqueue(MockResponse().setBody(okio.Buffer().write(body)))
        val end = async(start = CoroutineStart.UNDISPATCHED) {
            center.events(center.key(url)).first { it !is AttachmentDownloadEvent.Progress }
        }
        prefetcher(NetworkCondition.WIFI, AutoDownloadPolicy.WIFI_ONLY).prefetch(url, body.size.toLong(), category, MediaKind.VIDEO)
        assertThat(end.await()).isEqualTo(AttachmentDownloadEvent.Finished(body.size.toLong()))
        assertThat(haptics).isEmpty()
    } }

    @Test
    fun `une lecture qui rejoint un prechargement le releve`() = blocking {
        server.enqueue(slow())
        center.prefetch(url, body.size.toLong(), category, MediaTransferProfile.prefetch(meteredAllowed = false))
        assertThat(center.requestedProfile(center.key(url))!!.isDeferrable).isTrue()
        center.start(url, body.size.toLong(), category, DownloadOrigin.MANUAL)
        assertThat(center.requestedProfile(center.key(url))).isEqualTo(MediaTransferProfile.STANDARD)
        center.cancel(url)
    }

    @Test
    fun `cancelPrefetch annule un prechargement`() = blocking {
        server.enqueue(slow())
        val key = center.key(url)
        center.prefetch(url, body.size.toLong(), category)
        assertThat(center.progress(key)).isNotNull()
        center.cancelPrefetch(url)
        assertThat(center.progress(key)).isNull()
        assertThat(haptics).isEmpty()
    }

    @Test
    fun `cancelPrefetch ne touche jamais un telechargement lance par un tap`() = blocking {
        server.enqueue(slow())
        val key = center.key(url)
        center.start(url, body.size.toLong(), category, DownloadOrigin.MANUAL)
        center.cancelPrefetch(url)
        assertThat(center.progress(key)).isNotNull()
        center.cancel(url)
    }

    @Test
    fun `un tap qui rejoint un prechargement en devient proprietaire`() = blocking {
        server.enqueue(slow())
        val key = center.key(url)
        center.prefetch(url, body.size.toLong(), category)
        center.start(url, body.size.toLong(), category, DownloadOrigin.MANUAL)
        center.cancelPrefetch(url)
        assertThat(center.progress(key)).isNotNull()
        center.cancel(url)
        delay(50)
    }

    @Test
    fun `reglage Wi-Fi seulement sur cellulaire, planifie hors reseau facture au lieu de telecharger`() = blocking {
        prefetcher(NetworkCondition.GOOD_CELLULAR, AutoDownloadPolicy.WIFI_ONLY).prefetch(url, 5_000_000, category, MediaKind.VIDEO)
        assertThat(scheduled).containsExactly(url)
        assertThat(center.progress(center.key(url))).isNull()
    }

    @Test
    fun `hors ligne ou reglage jamais, rien ne part`() = blocking {
        prefetcher(NetworkCondition.OFFLINE, AutoDownloadPolicy.ALWAYS).prefetch(url, 5_000_000, category, MediaKind.VIDEO)
        prefetcher(NetworkCondition.WIFI, AutoDownloadPolicy.NEVER).prefetch(url, 5_000_000, category, MediaKind.VIDEO)
        assertThat(scheduled).isEmpty()
        assertThat(server.requestCount).isEqualTo(0)
    }

    @Test
    fun `le reglage donne le profil du prechargement, cellulaire permis ou non`() = blocking {
        server.enqueue(slow())
        prefetcher(NetworkCondition.WIFI, AutoDownloadPolicy.WIFI_ONLY).prefetch(url, 5_000_000, category, MediaKind.VIDEO)
        assertThat(center.requestedProfile(center.key(url))).isEqualTo(MediaTransferProfile.prefetch(meteredAllowed = false))
        center.cancelPrefetch(url)
        server.enqueue(slow())
        val other = server.url("/u/other.mp4").toString()
        prefetcher(NetworkCondition.WIFI, AutoDownloadPolicy.ALWAYS).prefetch(other, 5_000_000, category, MediaKind.VIDEO)
        assertThat(center.requestedProfile(center.key(other))).isEqualTo(MediaTransferProfile.prefetch(meteredAllowed = true))
        center.cancelPrefetch(other)
    }
}
