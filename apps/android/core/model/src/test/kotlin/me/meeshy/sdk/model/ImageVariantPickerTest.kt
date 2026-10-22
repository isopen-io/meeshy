package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Choix de la variante d'aperçu — miroir de `ImageVariantSelector.swift` (D4 /
 * levier bande passante 5.2) : la PLUS PETITE image dont la largeur en pixels est
 * `>=` la largeur d'affichage, jamais l'original multi-Mo pour une vignette.
 */
class ImageVariantPickerTest {

    private fun variant(width: Int, url: String, format: String = "webp") =
        MeeshyImageVariant(width = width, height = width * 3 / 4, url = url, size = width * 100, format = format)

    private val ladder = listOf(
        variant(640, "/v/640.webp"),
        variant(1080, "/v/1080.webp"),
        variant(1920, "/v/1920.webp"),
    )

    private fun best(
        variants: List<MeeshyImageVariant> = ladder,
        originalWidth: Int? = 4000,
        target: Int,
    ) = ImageVariantPicker.bestImageUrl(
        variants = variants,
        originalUrl = "/orig.jpg",
        originalWidth = originalWidth,
        targetWidthPx = target,
    )

    @Test
    fun `picks the smallest variant at or above the target`() {
        assertThat(best(target = 700)).isEqualTo("/v/1080.webp")
    }

    @Test
    fun `an exact match is served - the boundary is inclusive`() {
        assertThat(best(target = 640)).isEqualTo("/v/640.webp")
    }

    @Test
    fun `a target between two variants picks the next larger one`() {
        assertThat(best(target = 641)).isEqualTo("/v/1080.webp")
    }

    @Test
    fun `a target above every variant picks the original when it is strictly larger`() {
        assertThat(best(target = 1921)).isEqualTo("/orig.jpg")
    }

    @Test
    fun `a target above every variant keeps the largest variant when the original is not larger`() {
        assertThat(best(originalWidth = 1500, target = 1921)).isEqualTo("/v/1920.webp")
    }

    @Test
    fun `an original as wide as the largest variant never leaks the multi megabyte file`() {
        assertThat(best(originalWidth = 1920, target = 2500)).isEqualTo("/v/1920.webp")
    }

    @Test
    fun `no variants returns the original - the encrypted image fallback`() {
        assertThat(best(variants = emptyList(), target = 700)).isEqualTo("/orig.jpg")
    }

    @Test
    fun `zero width and empty url variants are ignored`() {
        val dirty = listOf(variant(0, "/bad-zero.webp"), variant(800, ""), variant(1080, "/v/1080.webp"))
        assertThat(best(variants = dirty, target = 700)).isEqualTo("/v/1080.webp")
    }

    @Test
    fun `an unknown original width never adds an upscale candidate`() {
        assertThat(best(originalWidth = null, target = 5000)).isEqualTo("/v/1920.webp")
    }

    @Test
    fun `the format never matters - width alone decides`() {
        val mixed = listOf(variant(640, "/v/640.webp"), variant(1080, "/v/1080.avif", format = "avif"))
        assertThat(best(variants = mixed, target = 700)).isEqualTo("/v/1080.avif")
    }

    @Test
    fun `a non positive target picks the cheapest candidate`() {
        assertThat(best(target = 0)).isEqualTo("/v/640.webp")
        assertThat(best(target = -5)).isEqualTo("/v/640.webp")
    }

    @Test
    fun `a single variant at the target is served`() {
        assertThat(best(variants = listOf(variant(640, "/v/640.webp")), originalWidth = null, target = 640))
            .isEqualTo("/v/640.webp")
    }

    @Test
    fun `two variants of the same width resolve to the last in url order whatever the input order`() {
        val tie = listOf(variant(640, "/v/b.webp"), variant(640, "/v/a.webp"))
        assertThat(best(variants = tie, originalWidth = null, target = 640)).isEqualTo("/v/b.webp")
        assertThat(best(variants = tie.reversed(), originalWidth = null, target = 640)).isEqualTo("/v/b.webp")
    }

    @Test
    fun `the retina floors of the bubble cells land on the expected rungs`() {
        assertThat(best(target = 900)).isEqualTo("/v/1080.webp")
        assertThat(best(target = 360)).isEqualTo("/v/640.webp")
    }

    @Test
    fun `nothing at all returns the empty original`() {
        assertThat(
            ImageVariantPicker.bestImageUrl(emptyList(), originalUrl = "", originalWidth = null, targetWidthPx = 0),
        ).isEmpty()
    }

    @Test
    fun `the lighter preview is the variant when it differs from the original`() {
        assertThat(
            ImageVariantPicker.lighterPreviewUrl(ladder, "/orig.jpg", originalWidth = 4000, targetWidthPx = 700),
        ).isEqualTo("/v/1080.webp")
    }

    @Test
    fun `the lighter preview is null when the original itself is the pick`() {
        assertThat(
            ImageVariantPicker.lighterPreviewUrl(ladder, "/orig.jpg", originalWidth = 4000, targetWidthPx = 5000),
        ).isNull()
    }

    @Test
    fun `the lighter preview is null without variants`() {
        assertThat(ImageVariantPicker.lighterPreviewUrl(null, "/orig.jpg", 4000, 700)).isNull()
        assertThat(ImageVariantPicker.lighterPreviewUrl(emptyList(), "/orig.jpg", 4000, 700)).isNull()
    }

    @Test
    fun `the display width in pixels scales the cell by the density`() {
        assertThat(ImageVariantPicker.displayWidthPx(widthDp = 252, density = 3f)).isEqualTo(756)
        assertThat(ImageVariantPicker.displayWidthPx(widthDp = 124, density = 2.625f)).isEqualTo(326)
        assertThat(ImageVariantPicker.displayWidthPx(widthDp = 0, density = 3f)).isEqualTo(0)
    }
}
