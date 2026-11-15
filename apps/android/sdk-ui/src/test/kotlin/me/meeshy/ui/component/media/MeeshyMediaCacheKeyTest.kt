package me.meeshy.ui.component.media

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyMediaCacheKeyTest {
    private val url = "https://cdn.meeshy.me/a/voice.m4a?sig=1"

    @Test
    fun `la cle d'une requete est la cle canonique de l'URL`() {
        val key = MeeshyMediaCacheKey.buildCacheKey(DataSpec(Uri.parse(url)))
        assertThat(key).isEqualTo(MediaCacheKey.of(url))
        assertThat(key).endsWith(".m4a")
    }

    @Test
    fun `une cle explicite de la requete prime`() {
        val spec = DataSpec.Builder().setUri(Uri.parse(url)).setKey("custom").build()
        assertThat(MeeshyMediaCacheKey.buildCacheKey(spec)).isEqualTo("custom")
    }

    @Test
    fun `la meme URL donne toujours la meme cle`() {
        assertThat(MeeshyMediaCacheKey.of(url)).isEqualTo(MeeshyMediaCacheKey.of(url))
        assertThat(MeeshyMediaCacheKey.of(url)).isNotEqualTo(MeeshyMediaCacheKey.of("$url&x=2"))
    }
}
