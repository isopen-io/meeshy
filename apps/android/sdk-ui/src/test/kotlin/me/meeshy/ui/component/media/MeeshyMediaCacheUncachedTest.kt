package me.meeshy.ui.component.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
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
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Un média protégé (éphémère, vue unique, flouté, chiffré) se lit par le client des médias SANS passer par le
 * cache disque : même identité que le reste, aucun tronçon écrit, aucun octet compté par le cache AUDIO.
 */
@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyMediaCacheUncachedTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

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

    private fun DataSource.readToEnd(): Int {
        val buffer = ByteArray(1_024)
        var total = 0
        while (true) {
            val read = read(buffer, 0, buffer.size)
            if (read == C.RESULT_END_OF_INPUT) return total
            total += read
        }
    }

    private fun spanFiles(cache: MeeshyMediaCache) =
        cache.spansDir(MediaCacheCategory.AUDIO).walk().filter { it.isFile && it.name.endsWith(".v3.exo") }.toList()

    @Test
    fun `un media protege est lu par le client des medias et ne laisse rien sur le disque`() {
        val served = Served(ByteArray(4_096) { 5 })
        val url = "https://gate.meeshy.me/api/v1/attachments/file/${UUID.randomUUID()}/vocal.m4a"
        val cache = MeeshyMediaCache.get(context)
        val bytesBefore = cache.diskBytes(MediaCacheCategory.AUDIO)
        val spansBefore = spanFiles(cache).size
        val previous = MeeshyMediaCache.networkCallFactory
        MeeshyMediaCache.networkCallFactory = served.factory

        try {
            val source = cache.uncachedDataSourceFactory().createDataSource()
            try {
                source.open(DataSpec(Uri.parse(url)))
                assertThat(source.readToEnd()).isEqualTo(4_096)
            } finally {
                source.close()
            }
        } finally {
            MeeshyMediaCache.networkCallFactory = previous
        }

        assertThat(served.requests.map { it.url.toString() }).containsExactly(url)
        assertThat(cache.diskBytes(MediaCacheCategory.AUDIO)).isEqualTo(bytesBefore)
        assertThat(spanFiles(cache)).hasSize(spansBefore)
        assertThat(cache.isFullyCached(MediaCacheCategory.AUDIO, MeeshyMediaCacheKey.of(url))).isFalse()
    }
}
