package me.meeshy.ui.component.media

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.FileDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.IOException

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaFileExporterTest {
    @get:Rule val folder = TemporaryFolder()

    private val url = "https://cdn.meeshy.me/a/voice.m4a"
    private val payload = ByteArray(200_000) { (it % 251).toByte() }

    private fun cache() = SimpleCache(File(folder.root, "spans"), NoOpCacheEvictor())

    private fun factory(cache: SimpleCache, online: Boolean): CacheDataSource.Factory =
        CacheDataSource.Factory()
            .setCache(cache)
            .setCacheKeyFactory(MeeshyMediaCacheKey)
            .setUpstreamDataSourceFactory(
                if (online) DataSource.Factory { ByteArrayDataSource(payload) }
                else DataSource.Factory { FileDataSource() },
            )

    @Test
    fun `un export en ligne copie toute la ressource`() {
        val cache = cache()
        val target = File(folder.root, "out/voice.m4a")
        val written = MediaFileExporter(factory(cache, online = true)).export(url, target)
        assertThat(written).isEqualTo(payload.size.toLong())
        assertThat(target.readBytes()).isEqualTo(payload)
        assertThat(File(folder.root, "out/voice.m4a.part").exists()).isFalse()
        cache.release()
    }

    @Test
    fun `une ressource partiellement en cache se complete par le reseau`() {
        val cache = cache()
        val spec = DataSpec.Builder().setUri(Uri.parse(url)).setKey(MeeshyMediaCacheKey.of(url))
            .setLength(50_000).build()
        CacheWriter(factory(cache, online = true).createDataSource(), spec, null, null).cache()
        val target = File(folder.root, "voice.m4a")
        MediaFileExporter(factory(cache, online = true)).export(url, target)
        assertThat(target.readBytes()).isEqualTo(payload)
        cache.release()
    }

    @Test
    fun `une ressource entierement en cache s'exporte hors ligne`() {
        val cache = cache()
        MediaFileExporter(factory(cache, online = true)).export(url, File(folder.root, "first.m4a"))
        val target = File(folder.root, "offline.m4a")
        MediaFileExporter(factory(cache, online = false)).export(url, target)
        assertThat(target.readBytes()).isEqualTo(payload)
        cache.release()
    }

    @Test
    fun `un echec reseau ne laisse aucun fichier`() {
        val cache = cache()
        val target = File(folder.root, "fail.m4a")
        assertThrows(IOException::class.java) {
            MediaFileExporter(factory(cache, online = false)).export(url, target)
        }
        assertThat(target.exists()).isFalse()
        assertThat(File(folder.root, "fail.m4a.part").exists()).isFalse()
        cache.release()
    }
}
