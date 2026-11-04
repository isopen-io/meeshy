package me.meeshy.app.settings

import android.content.Context
import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.model.mediacache.CacheMediaKind
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.ui.component.media.MeeshyMediaCache
import me.meeshy.ui.component.media.MeeshyMediaCacheKey
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.security.MessageDigest

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidMediaCacheStoreTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun played(category: MediaCacheCategory, url: String, bytes: Int) {
        val factory = CacheDataSource.Factory()
            .setCache(MeeshyMediaCache.get(context).cacheFor(category))
            .setCacheKeyFactory(MeeshyMediaCacheKey)
            .setUpstreamDataSourceFactory { ByteArrayDataSource(ByteArray(bytes) { 7 }) }
        val spec = DataSpec.Builder().setUri(Uri.parse(url)).setKey(MediaCacheKey.of(url)).build()
        CacheWriter(factory.createDataSource(), spec, null, null).cache()
    }

    private fun isCached(category: MediaCacheCategory, url: String): Boolean =
        MeeshyMediaCache.get(context).isFullyCached(category, MediaCacheKey.of(url))

    @Test
    fun `la taille et l effacement visent les caches Media3 de l audio et de la video`() = runTest {
        val sound = "https://gate.meeshy.me/api/v1/attachments/file/voice.m4a"
        val clip = "https://gate.meeshy.me/api/v1/attachments/file/clip.mp4"
        played(MediaCacheCategory.AUDIO, sound, bytes = 4_096)
        played(MediaCacheCategory.VIDEO, clip, bytes = 8_192)
        val store = AndroidMediaCacheStore(context)

        val before = store.report()
        assertThat(before.bytesFor(MediaCacheCategory.AUDIO)).isAtLeast(4_096L)
        assertThat(before.bytesFor(MediaCacheCategory.VIDEO)).isAtLeast(8_192L)

        store.clear(setOf(MediaCacheCategory.AUDIO))

        assertThat(isCached(MediaCacheCategory.AUDIO, sound)).isFalse()
        assertThat(isCached(MediaCacheCategory.VIDEO, clip)).isTrue()
        assertThat(store.report().bytesFor(MediaCacheCategory.AUDIO)).isEqualTo(0L)

        store.clear(setOf(MediaCacheCategory.VIDEO))

        assertThat(isCached(MediaCacheCategory.VIDEO, clip)).isFalse()
        assertThat(store.report().bytesFor(MediaCacheCategory.VIDEO)).isEqualTo(0L)
    }

    private fun sha256Hex(url: String): String =
        MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun coilDir(): File = File(context.cacheDir, "image_cache").apply { mkdirs() }

    private fun File.fill(name: String, bytes: Int) = File(this, name).also { it.writeBytes(ByteArray(bytes)) }

    @Test
    fun `le cache d images de Coil se mesure et se vide par cle sans toucher au journal`() = runTest {
        val kept = "https://gate.meeshy.me/api/v1/attachments/file/kept.jpg"
        val gone = "https://gate.meeshy.me/api/v1/attachments/file/gone.jpg"
        val dir = coilDir()
        dir.fill("${sha256Hex(kept)}.0", 10)
        dir.fill("${sha256Hex(kept)}.1", 1_000)
        dir.fill("${sha256Hex(gone)}.0", 10)
        dir.fill("${sha256Hex(gone)}.1", 2_000)
        dir.fill("journal", 77)
        val coil = AndroidMediaCacheStore(context).stores(CacheMediaKind.IMAGES).first()

        assertThat(coil.totalBytes()).isEqualTo(3_020L)
        assertThat(coil.bytesFor(setOf(gone))).isEqualTo(2_010L)
        assertThat(coil.bytesExcluding(setOf(kept))).isEqualTo(2_010L)

        assertThat(coil.purge(setOf(gone))).isEqualTo(2_010L)

        assertThat(File(dir, "${sha256Hex(gone)}.1").exists()).isFalse()
        assertThat(File(dir, "${sha256Hex(kept)}.1").exists()).isTrue()
        assertThat(File(dir, "journal").exists()).isTrue()
    }

    @Test
    fun `les vignettes se purgent par cle et le residu part en bloc`() = runTest {
        val dir = MediaCacheDirs(context.cacheDir, context.cacheDir).dirFor(MediaCacheCategory.THUMBNAILS).apply { mkdirs() }
        val claimed = "https://gate.meeshy.me/t/claimed.png"
        val orphan = "https://gate.meeshy.me/t/orphan.png"
        dir.fill(MediaCacheKey.of(claimed), 300)
        dir.fill(MediaCacheKey.of(orphan), 500)
        val thumbs = AndroidMediaCacheStore(context).stores(CacheMediaKind.IMAGES).last()

        assertThat(thumbs.bytesFor(setOf(claimed))).isEqualTo(300L)
        assertThat(thumbs.bytesExcluding(setOf(claimed))).isEqualTo(500L)
        assertThat(thumbs.purgeExcluding(setOf(claimed))).isEqualTo(500L)

        assertThat(File(dir, MediaCacheKey.of(claimed)).exists()).isTrue()
        assertThat(File(dir, MediaCacheKey.of(orphan)).exists()).isFalse()
    }

    @Test
    fun `un dossier absent pese zero octet et ne purge rien`() = runTest {
        val stores = AndroidMediaCacheStore(context).stores(CacheMediaKind.IMAGES)

        stores.forEach { store ->
            assertThat(store.totalBytes()).isEqualTo(0L)
            assertThat(store.bytesFor(setOf("https://x/none.png"))).isEqualTo(0L)
            assertThat(store.purge(setOf("https://x/none.png"))).isEqualTo(0L)
            assertThat(store.purgeExcluding(emptySet())).isEqualTo(0L)
        }
    }
}
