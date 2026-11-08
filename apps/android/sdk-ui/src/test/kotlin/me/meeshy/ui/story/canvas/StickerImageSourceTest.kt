package me.meeshy.ui.story.canvas

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerImageSourceTest {
    @Test
    fun `le cote decode est borne par le budget de pixels`() {
        assertThat(StickerImageSource.decodeSide(5000)).isEqualTo(StickerImageSource.MAX_DECODE_SIDE)
        assertThat(StickerImageSource.decodeSide(200)).isEqualTo(200)
        assertThat(StickerImageSource.decodeSide(0)).isEqualTo(1)
    }
}
