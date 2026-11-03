package me.meeshy.ui.story.canvas

import android.content.ComponentCallbacks2
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StickerEmojiRasterizerTest {

    @Test
    fun `la cle de cache est l emoji et le cote entier`() {
        assertThat(StickerEmojiRasterizer.cacheKey("🔥", 120)).isEqualTo("🔥|120")
    }

    @Test
    fun `un meme emoji au meme cote est rasterise une seule fois`() {
        val rasterizer = StickerEmojiRasterizer()
        val first = rasterizer.bitmap("🔥", 64)
        assertThat(first).isNotNull()
        assertThat(first!!.width).isEqualTo(64)
        assertThat(rasterizer.bitmap("🔥", 64)).isSameInstanceAs(first)
        assertThat(rasterizer.bitmap("🔥", 65)).isNotSameInstanceAs(first)
    }

    @Test
    fun `rien a peindre pour un emoji vide ou un cote nul`() {
        val rasterizer = StickerEmojiRasterizer()
        assertThat(rasterizer.bitmap(" ", 64)).isNull()
        assertThat(rasterizer.bitmap("🔥", 0)).isNull()
    }

    @Test
    fun `le cache est vide quand le systeme demande de la memoire`() {
        val rasterizer = StickerEmojiRasterizer()
        rasterizer.bitmap("🔥", 64)
        rasterizer.onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
        assertThat(rasterizer.cached("🔥", 64)).isNull()
    }

    @Test
    fun `un signal de memoire leger ne vide rien`() {
        val rasterizer = StickerEmojiRasterizer()
        rasterizer.bitmap("🔥", 64)
        rasterizer.onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN)
        assertThat(rasterizer.cached("🔥", 64)).isNotNull()
    }

    @Test
    fun `le cache est borne en nombre`() {
        val rasterizer = StickerEmojiRasterizer(countLimit = 2)
        rasterizer.bitmap("🔥", 32)
        rasterizer.bitmap("🎈", 32)
        rasterizer.bitmap("⭐", 32)
        assertThat(rasterizer.cached("🔥", 32)).isNull()
        assertThat(rasterizer.cached("⭐", 32)).isNotNull()
    }
}
