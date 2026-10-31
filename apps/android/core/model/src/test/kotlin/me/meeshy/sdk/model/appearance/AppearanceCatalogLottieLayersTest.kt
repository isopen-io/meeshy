package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13952 — les couches animées que le catalogue embarqué référence : celles qu'Android doit embarquer et jouer. */
class AppearanceCatalogLottieLayersTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    @Test
    fun `the embedded catalog references the nine animated layers and the twelve illustrated films, each once`() {
        val layers = catalog.lottieLayers
        assertThat(layers).hasSize(21)
        assertThat(layers.map { it.sha256 }.toSet()).hasSize(21)
    }

    @Test
    fun `the layers are the animated packs' rings, banners and wallpapers, then both films of each illustrated frame`() {
        val rings = listOf("halo-or", "prisme-vivant", "onde").map { catalog.ring("contours-animes", it)?.lottie }
        val banners = listOf("aurore-vive", "maree", "braises").map { catalog.bannerDesign("bannieres-animees", it)?.lottie }
        val wallpapers = listOf("brume-vivante", "bulles-legeres", "pluie-de-petales").map {
            (catalog.wallpaper("animes", it) as? WallpaperDesign.Designed)?.design?.lottie
        }
        val films = catalog.ringPacks.first { it.slug == "cadres-illustres" }.rings.flatMap { listOf(it.decor?.back, it.decor?.front) }
        assertThat(films).hasSize(12)
        val expected = rings + banners + wallpapers + films
        assertThat(expected).doesNotContain(null)
        assertThat(catalog.lottieLayers).containsExactlyElementsIn(expected)
    }

    @Test
    fun `an empty catalog carries no layer`() {
        assertThat(AppearanceCatalog.EMPTY.lottieLayers).isEmpty()
    }
}
