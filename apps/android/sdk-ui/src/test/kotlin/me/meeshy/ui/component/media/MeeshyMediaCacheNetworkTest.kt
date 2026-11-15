package me.meeshy.ui.component.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.IOException
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14613 — la lecture par [MeeshyMediaCache] passe par le client des médias installé, et le repli sur la pile intégrée
 * se compte au lieu de passer en silence.
 *
 * #13573 — un lecteur du compte quitté encore actif à la purge ne laisse AUCUN tronçon : son flux s'arrête à la
 * lecture qui suit la purge, un tronçon commencé avant elle n'est jamais validé après elle, et celui qui s'écrivait
 * encore quitte le disque avec elle — `SimpleCache` l'adopterait sinon au démarrage suivant.
 */
@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyMediaCacheNetworkTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    /** Un serveur de médias en mémoire : chaque requête est notée, et sert [body] en entier. */
    private class Served(private val body: ByteArray) {
        val requests = CopyOnWriteArrayList<Request>()
        private val client: OkHttpClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                requests += chain.request()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(body.toResponseBody("audio/mp4".toMediaType()))
                    .build()
            }
            .build()
        val factory = Call.Factory { request -> client.newCall(request) }
    }

    private fun <T> withMediaClient(factory: Call.Factory?, block: () -> T): T {
        val previous = MeeshyMediaCache.networkCallFactory
        MeeshyMediaCache.networkCallFactory = factory
        try {
            return block()
        } finally {
            MeeshyMediaCache.networkCallFactory = previous
        }
    }

    private fun spanFiles(cache: MeeshyMediaCache): List<java.io.File> =
        cache.spansDir(MediaCacheCategory.AUDIO).walk().filter { it.isFile && it.name.endsWith(".v3.exo") }.toList()

    private fun soundUrl() = "https://gate.meeshy.me/api/v1/static/${UUID.randomUUID()}.m4a"

    private fun DataSource.readToEnd(): Int {
        val buffer = ByteArray(1_024)
        var total = 0
        while (true) {
            val read = read(buffer, 0, buffer.size)
            if (read == C.RESULT_END_OF_INPUT) return total
            total += read
        }
    }

    @Test
    fun `un media lu par le cache passe par le client des medias installe`() {
        val served = Served(ByteArray(4_096) { 3 })
        val url = soundUrl()

        withMediaClient(served.factory) {
            val source = MeeshyMediaCache.get(context).dataSourceFactory(MediaCacheCategory.AUDIO).createDataSource()
            try {
                source.open(DataSpec(Uri.parse(url)))
                assertThat(source.readToEnd()).isEqualTo(4_096)
            } finally {
                source.close()
            }
        }

        assertThat(served.requests.map { it.url.toString() }).containsExactly(url)
    }

    @Test
    fun `sans client des medias installe, le repli sur la pile integree se compte`() {
        val before = MeeshyMediaCache.builtInFallbackCount

        withMediaClient(null) { MeeshyMediaCache.get(context).dataSourceFactory(MediaCacheCategory.AUDIO) }

        assertThat(MeeshyMediaCache.builtInFallbackCount).isEqualTo(before + 1)
    }

    @Test
    fun `un flux ouvert avant la purge du compte s arrete et ne laisse aucun troncon`() {
        val served = Served(ByteArray(8_192) { 5 })
        val url = soundUrl()
        val cache = MeeshyMediaCache.get(context)

        withMediaClient(served.factory) {
            val source = cache.dataSourceFactory(MediaCacheCategory.AUDIO).createDataSource()
            try {
                source.open(DataSpec(Uri.parse(url)))
                assertThat(source.read(ByteArray(4_096), 0, 4_096)).isGreaterThan(0)
                AccountMediaWipe.wipe(context)
                assertThrows(IOException::class.java) { source.read(ByteArray(4_096), 0, 4_096) }
            } finally {
                source.close()
            }
        }

        assertThat(cache.cacheFor(MediaCacheCategory.AUDIO).getCachedSpans(MeeshyMediaCacheKey.of(url))).isEmpty()
    }

    @Test
    fun `un flux ouvert apres la purge se met en cache normalement`() {
        val served = Served(ByteArray(8_192) { 6 })
        val url = soundUrl()
        val cache = MeeshyMediaCache.get(context)
        AccountMediaWipe.wipe(context)

        withMediaClient(served.factory) {
            val source = cache.dataSourceFactory(MediaCacheCategory.AUDIO).createDataSource()
            try {
                source.open(DataSpec(Uri.parse(url)))
                source.readToEnd()
            } finally {
                source.close()
            }
        }

        assertThat(cache.isFullyCached(MediaCacheCategory.AUDIO, MeeshyMediaCacheKey.of(url))).isTrue()
    }

    @Test
    fun `un troncon commence avant la purge et valide apres elle ne reste pas`() {
        val cache = MeeshyMediaCache.get(context)
        val url = soundUrl()
        val key = MeeshyMediaCacheKey.of(url)
        val audio = cache.cacheFor(MediaCacheCategory.AUDIO)
        val hole = audio.startReadWrite(key, 0L, C.LENGTH_UNSET.toLong())
        try {
            val sink = cache.writeSinkFactory(MediaCacheCategory.AUDIO).createDataSink()
            sink.open(DataSpec.Builder().setUri(Uri.parse(url)).setKey(key).setLength(4_096L).build())
            sink.write(ByteArray(4_096) { 1 }, 0, 4_096)
            AccountMediaWipe.wipe(context)
            sink.close()
        } finally {
            audio.releaseHoleSpan(hole)
        }

        assertThat(audio.getCachedSpans(key)).isEmpty()
    }

    @Test
    fun `un troncon en cours d ecriture a la purge quitte le disque, et plus rien ne s y ecrit`() {
        val cache = MeeshyMediaCache.get(context)
        val url = soundUrl()
        val key = MeeshyMediaCacheKey.of(url)
        val audio = cache.cacheFor(MediaCacheCategory.AUDIO)
        val hole = audio.startReadWrite(key, 0L, C.LENGTH_UNSET.toLong())
        try {
            val sink = cache.writeSinkFactory(MediaCacheCategory.AUDIO).createDataSink()
            sink.open(DataSpec.Builder().setUri(Uri.parse(url)).setKey(key).setLength(65_536L).build())
            sink.write(ByteArray(32_768) { 2 }, 0, 32_768)
            assertThat(spanFiles(cache)).isNotEmpty()

            AccountMediaWipe.wipe(context)

            assertThat(spanFiles(cache)).isEmpty()
            assertThrows(IOException::class.java) { sink.write(ByteArray(1_024) { 2 }, 0, 1_024) }
            sink.close()
        } finally {
            audio.releaseHoleSpan(hole)
        }

        assertThat(spanFiles(cache)).isEmpty()
        assertThat(audio.getCachedSpans(key)).isEmpty()
    }
}
