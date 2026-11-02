package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class BannerSourceResolverTest {

    private val design: AppearanceDesign = Json { ignoreUnknownKeys = true }
        .decodeFromString(AppearanceDesign.serializer(), AppearanceFixtures.gradientJson().toString())

    @Test
    fun `a design banner wins over the photo`() {
        assertThat(BannerSourceResolver.resolve(design, "https://x/y.jpg")).isEqualTo(BannerSource.Design(design))
    }

    @Test
    fun `the photo shows when there is no design`() {
        assertThat(BannerSourceResolver.resolve(null, "https://x/y.jpg")).isEqualTo(BannerSource.Photo("https://x/y.jpg"))
    }

    @Test
    fun `neither design nor a usable photo shows nothing`() {
        assertThat(BannerSourceResolver.resolve(null, null)).isEqualTo(BannerSource.None)
        assertThat(BannerSourceResolver.resolve(null, "  ")).isEqualTo(BannerSource.None)
    }

    @Test
    fun `the banner is three to one`() {
        assertThat(BannerSourceResolver.ASPECT_RATIO).isEqualTo(3f)
    }
}
