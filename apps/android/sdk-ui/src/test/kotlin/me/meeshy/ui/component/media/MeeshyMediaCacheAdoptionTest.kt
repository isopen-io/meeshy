package me.meeshy.ui.component.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.datasource.cache.CacheDataSource
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.UUID

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyMediaCacheAdoptionTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val cache = MeeshyMediaCache.get(context)

    private fun url(extension: String) = "https://gate.meeshy.me/api/v1/attachments/file/2026/10/${UUID.randomUUID()}/sent.$extension"

    private fun bytes(count: Int) = ByteArray(count) { (it % 251).toByte() }

    private fun fileOf(content: ByteArray): File =
        File.createTempFile("sent", ".m4a", context.cacheDir).apply { writeBytes(content) }

    private fun isCached(category: MediaCacheCategory, url: String) = cache.isFullyCached(category, MeeshyMediaCacheKey.of(url))

    /** Lit [url] par le cache, avec un réseau qui refuse toute ouverture : ce qui revient vient du disque. */
    private fun readOffline(category: MediaCacheCategory, url: String): ByteArray {
        val source = CacheDataSource.Factory()
            .setCache(cache.cacheFor(category))
            .setCacheKeyFactory(MeeshyMediaCacheKey)
            .setUpstreamDataSourceFactory { OfflineNetwork() }
            .createDataSource()
        source.open(DataSpec.Builder().setUri(Uri.parse(url)).build())
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(1_024)
        try {
            while (true) {
                val read = source.read(buffer, 0, buffer.size)
                if (read == C.RESULT_END_OF_INPUT) break
                out.write(buffer, 0, read)
            }
        } finally {
            source.close()
        }
        return out.toByteArray()
    }

    private class OfflineNetwork : DataSource {
        override fun addTransferListener(transferListener: TransferListener) = Unit
        override fun open(dataSpec: DataSpec): Long = throw IOException("aucun réseau")
        override fun read(buffer: ByteArray, offset: Int, length: Int): Int = throw IOException("aucun réseau")
        override fun getUri(): Uri? = null
        override fun close() = Unit
    }

    private fun failingAfter(content: ByteArray, count: Int): InputStream = object : InputStream() {
        private var position = 0
        override fun read(): Int {
            if (position >= count) throw IOException("lecture interrompue")
            return content[position++].toInt() and 0xFF
        }
    }

    @Test
    fun `un fichier envoye adopte est en cache entier et se relit sans reseau`() {
        val sound = url("m4a")
        val content = bytes(6_000)
        val file = fileOf(content)

        val adopted = cache.adopt(MediaCacheCategory.AUDIO, sound, file.length()) { file.inputStream() }

        assertThat(adopted).isTrue()
        assertThat(isCached(MediaCacheCategory.AUDIO, sound)).isTrue()
        assertThat(readOffline(MediaCacheCategory.AUDIO, sound)).isEqualTo(content)
        assertThat(file.exists()).isTrue()
    }

    @Test
    fun `une video adoptee entre au cache video et pas au cache audio`() {
        val clip = url("mp4")
        val content = bytes(9_000)

        assertThat(cache.adopt(MediaCacheCategory.VIDEO, clip, content.size.toLong()) { ByteArrayInputStream(content) }).isTrue()

        assertThat(readOffline(MediaCacheCategory.VIDEO, clip)).isEqualTo(content)
        assertThat(isCached(MediaCacheCategory.AUDIO, clip)).isFalse()
    }

    @Test
    fun `une lecture qui echoue ne laisse rien en cache et rend le verrou`() {
        val sound = url("m4a")
        val content = bytes(4_000)

        val failed = cache.adopt(MediaCacheCategory.AUDIO, sound, content.size.toLong()) { failingAfter(content, 1_500) }

        assertThat(failed).isFalse()
        assertThat(isCached(MediaCacheCategory.AUDIO, sound)).isFalse()
        assertThat(cache.cacheFor(MediaCacheCategory.AUDIO).getCachedBytes(MeeshyMediaCacheKey.of(sound), 0L, content.size.toLong())).isEqualTo(0L)
        assertThat(cache.adopt(MediaCacheCategory.AUDIO, sound, content.size.toLong()) { ByteArrayInputStream(content) }).isTrue()
        assertThat(readOffline(MediaCacheCategory.AUDIO, sound)).isEqualTo(content)
    }

    @Test
    fun `une source plus courte que la longueur annoncee n est pas adoptee`() {
        val sound = url("m4a")
        val content = bytes(2_000)

        val adopted = cache.adopt(MediaCacheCategory.AUDIO, sound, 3_000L) { ByteArrayInputStream(content) }

        assertThat(adopted).isFalse()
        assertThat(isCached(MediaCacheCategory.AUDIO, sound)).isFalse()
        assertThat(cache.adopt(MediaCacheCategory.AUDIO, sound, content.size.toLong()) { ByteArrayInputStream(content) }).isTrue()
    }

    @Test
    fun `une ressource deja en cache n est pas reecrite`() {
        val sound = url("m4a")
        val content = bytes(1_000)
        cache.adopt(MediaCacheCategory.AUDIO, sound, content.size.toLong()) { ByteArrayInputStream(content) }

        val again = cache.adopt(MediaCacheCategory.AUDIO, sound, content.size.toLong()) { throw IOException("ne doit pas être relu") }

        assertThat(again).isTrue()
        assertThat(readOffline(MediaCacheCategory.AUDIO, sound)).isEqualTo(content)
    }
}
