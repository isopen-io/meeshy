package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13952 — les couches animées que le catalogue embarqué référence : celles qu'Android doit embarquer et jouer. */
class AppearanceCatalogLottieLayersTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    @Test
    fun `the embedded catalog references the nine animated layers, each once`() {
        val layers = catalog.lottieLayers
        assertThat(layers).hasSize(9)
        assertThat(layers.map { it.sha256 }.toSet()).hasSize(9)
    }

    @Test
    fun `the nine layers are the three rings, the three banners and the three wallpapers of the animated packs`() {
        val rings = listOf("halo-or", "prisme-vivant", "onde").map { catalog.ring("contours-animes", it)?.lottie }
        val banners = listOf("aurore-vive", "maree", "braises").map { catalog.bannerDesign("bannieres-animees", it)?.lottie }
        val wallpapers = listOf("brume-vivante", "bulles-legeres", "pluie-de-petales").map {
            (catalog.wallpaper("animes", it) as? WallpaperDesign.Designed)?.design?.lottie
        }
        val expected = rings + banners + wallpapers
        assertThat(expected).doesNotContain(null)
        assertThat(catalog.lottieLayers).containsExactlyElementsIn(expected)
    }

    @Test
    fun `an empty catalog carries no layer`() {
        assertThat(AppearanceCatalog.EMPTY.lottieLayers).isEmpty()
    }
}
