package me.meeshy.app.chat.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareThumbnailDecoderTest {
    @Test
    fun `a 48 megapixel photo is decoded at an eighth so the long side stays above 160`() {
        assertThat(ShareThumbnailDecoder.sampleSize(8000, 6000, 160)).isEqualTo(32)
    }

    @Test
    fun `a small image is never subsampled`() {
        assertThat(ShareThumbnailDecoder.sampleSize(200, 100, 160)).isEqualTo(1)
        assertThat(ShareThumbnailDecoder.sampleSize(0, 0, 160)).isEqualTo(1)
    }
}
