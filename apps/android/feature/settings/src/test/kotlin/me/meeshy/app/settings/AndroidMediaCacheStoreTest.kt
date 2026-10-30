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
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.ui.component.media.MeeshyMediaCache
import me.meeshy.ui.component.media.MeeshyMediaCacheKey
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

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
}
