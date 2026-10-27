package me.meeshy.ui.component.media

import androidx.media3.common.util.UnstableApi
import androidx.test.core.app.ApplicationProvider
import android.content.Context
import android.net.Uri
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AccountMediaWipeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun store(cache: MeeshyMediaCache, category: MediaCacheCategory, url: String) {
        val factory = CacheDataSource.Factory()
            .setCache(cache.cacheFor(category))
            .setCacheKeyFactory(MeeshyMediaCacheKey)
            .setUpstreamDataSourceFactory { ByteArrayDataSource(ByteArray(4_096) { 7 }) }
        val spec = DataSpec.Builder().setUri(Uri.parse(url)).setKey(MeeshyMediaCacheKey.of(url)).build()
        CacheWriter(factory.createDataSource(), spec, null, null).cache()
    }

    @Test
    fun `changer de compte vide l audio obtenu avec le jeton du compte quitte, et laisse la video`() {
        val cache = MeeshyMediaCache.get(context)
        val sound = "https://gate.meeshy.me/api/v1/static/private.m4a"
        val video = "https://gate.meeshy.me/api/v1/attachments/file/clip.mp4"
        store(cache, MediaCacheCategory.AUDIO, sound)
        store(cache, MediaCacheCategory.VIDEO, video)
        assertThat(cache.isFullyCached(MediaCacheCategory.AUDIO, MeeshyMediaCacheKey.of(sound))).isTrue()
        assertThat(cache.isFullyCached(MediaCacheCategory.VIDEO, MeeshyMediaCacheKey.of(video))).isTrue()

        AccountMediaWipe.wipe(context)

        assertThat(cache.isFullyCached(MediaCacheCategory.AUDIO, MeeshyMediaCacheKey.of(sound))).isFalse()
        assertThat(cache.isFullyCached(MediaCacheCategory.VIDEO, MeeshyMediaCacheKey.of(video))).isTrue()
    }
}
