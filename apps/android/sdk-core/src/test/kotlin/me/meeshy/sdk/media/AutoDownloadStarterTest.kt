package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.media.MediaAvailabilityState
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.concurrent.TimeUnit

class AutoDownloadStarterTest {
    @get:Rule val folder = TemporaryFolder()

    private val server = MockWebServer().apply { start() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val body = ByteArray(40_000) { 1 }
    private val network = InMemoryNetworkConditionMonitor(NetworkCondition.WIFI)
    private val prefs = InMemoryMediaDownloadPreferencesStore(MediaDownloadPreferences())

    private val cache by lazy { TypedMediaCache(MediaCacheDirs(folder.root, folder.root)) }
    private val center by lazy {
        AttachmentDownloadCenter(MediaFetcher(cache, MediaFileDownloader(OkHttpClient()), scope), cache, scope)
    }
    private val starter by lazy { AutoDownloadStarter(center, prefs, network) }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
    }

    private fun request(kind: MediaKind = MediaKind.AUDIO) = MediaRequest(server.url("/u/v.m4a").toString(), kind, 5_000_000)
    private val needs = MediaAvailabilityState.NeedsDownload(5_000_000)

    private fun slow() = MockResponse().setBody(okio.Buffer().write(body)).throttleBody(10_000, 100, TimeUnit.MILLISECONDS)

    @Test
    fun `la politique autorise, le telechargement part une seule fois par cle`() = runBlocking {
        withTimeout(10_000) {
            server.enqueue(slow())
            assertThat(starter.maybeStart(request(), needs)).isTrue()
            assertThat(starter.maybeStart(request(), needs)).isFalse()
            center.awaitEnd(center.key(request().url))
            assertThat(starter.maybeStart(request(), needs)).isFalse()
            assertThat(server.requestCount).isEqualTo(1)
        }
    }

    @Test
    fun `pas de double lancement quand un telechargement est deja en vol`() = runBlocking {
        withTimeout(10_000) {
            server.enqueue(slow())
            center.start(request().url, 5_000_000, me.meeshy.sdk.model.mediacache.MediaCacheCategory.AUDIO, me.meeshy.sdk.model.media.DownloadOrigin.MANUAL)
            assertThat(starter.maybeStart(request(), MediaAvailabilityState.Downloading(1, 2))).isFalse()
            center.awaitEnd(center.key(request().url))
            assertThat(server.requestCount).isEqualTo(1)
        }
    }

    @Test
    fun `hors ligne ou politique refusee rien ne part`() {
        network.set(NetworkCondition.OFFLINE)
        assertThat(starter.maybeStart(request(), needs)).isFalse()
        network.set(NetworkCondition.WIFI)
        runBlocking { prefs.setPreferences(MediaDownloadPreferences().copy(audio = AutoDownloadPolicy.NEVER)) }
        assertThat(starter.maybeStart(request(), needs)).isFalse()
        assertThat(server.requestCount).isEqualTo(0)
    }

    @Test
    fun `un echec ne repart pas seul`() {
        assertThat(starter.maybeStart(request(), MediaAvailabilityState.Failed())).isFalse()
    }
}
