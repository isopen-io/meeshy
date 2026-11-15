package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageRequestSizingTest {

    @Test
    fun `a 40 dp avatar on a 3x screen asks for 120 px`() {
        assertThat(ImageRequestSizing.widthPx(dp = 40f, density = 3f)).isEqualTo(120)
    }

    @Test
    fun `a fractional density rounds up so the variant always covers the box`() {
        assertThat(ImageRequestSizing.widthPx(dp = 124f, density = 2.625f)).isEqualTo(326)
    }

    @Test
    fun `a degenerate box asks for nothing`() {
        assertThat(ImageRequestSizing.widthPx(dp = 0f, density = 3f)).isEqualTo(0)
        assertThat(ImageRequestSizing.widthPx(dp = -4f, density = 3f)).isEqualTo(0)
        assertThat(ImageRequestSizing.widthPx(dp = 40f, density = 0f)).isEqualTo(0)
    }

    @Test
    fun `a 120 px avatar picks the 150 px variant and never the multi megabyte original`() {
        val variants = listOf(
            MeeshyImageVariant(width = 150, height = 150, url = "/v/150.webp", size = 4000),
            MeeshyImageVariant(width = 640, height = 640, url = "/v/640.webp", size = 40000),
        )
        val url = ImageVariantPicker.bestImageUrl(
            variants, "/orig.jpg", 4000, ImageRequestSizing.widthPx(dp = 40f, density = 3f),
        )
        assertThat(url).isEqualTo("/v/150.webp")
    }
}
