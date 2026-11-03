package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13952 — les couches animées que le catalogue embarqué référence : celles qu'Android doit embarquer et jouer. */
class AppearanceCatalogLottieLayersTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    @Test
    fun `the embedded catalog references the nine animated layers, the 72 illustrated films, the 12 Christmas films and the 13 living Meeshy layers, each once`() {
        val layers = catalog.lottieLayers
        assertThat(layers).hasSize(106)
        assertThat(layers.map { it.sha256 }.toSet()).hasSize(106)
    }

    @Test
    fun `the layers are the animated packs' rings, banners and wallpapers, then both films of each illustrated frame, showcase, cultural families and Christmas, then the living Meeshy collections`() {
        val rings = listOf("halo-or", "prisme-vivant", "onde").map { catalog.ring("contours-animes", it)?.lottie }
        val banners = listOf("aurore-vive", "maree", "braises").map { catalog.bannerDesign("bannieres-animees", it)?.lottie }
        val wallpapers = listOf("brume-vivante", "bulles-legeres", "pluie-de-petales").map {
            (catalog.wallpaper("animes", it) as? WallpaperDesign.Designed)?.design?.lottie
        }
        val films = catalog.ringPacks.filter { it.slug.startsWith("cadres-") }.flatMap { pack -> pack.rings.flatMap { listOf(it.decor?.back, it.decor?.front) } }
        assertThat(films).hasSize(72)
        val christmas = listOf("noel-enneige", "lumieres-de-noel", "atelier-du-pere-noel")
            .flatMap { slug -> catalog.ringPacks.single { it.slug == slug }.rings.flatMap { listOf(it.decor?.back, it.decor?.front) } }
        assertThat(christmas).hasSize(12)
        val meeshy = catalog.wallpaperPacks.single { it.slug == "meeshy-fonds-vivants" }.designs.map { it.lottie } +
            catalog.ringPacks.single { it.slug == "meeshy-vivants" }.rings.flatMap { listOfNotNull(it.lottie, it.decor?.back, it.decor?.front) }
        assertThat(meeshy).hasSize(13)
        val expected = rings + banners + wallpapers + films + christmas + meeshy
        assertThat(expected).doesNotContain(null)
        assertThat(catalog.lottieLayers).containsExactlyElementsIn(expected)
    }

    @Test
    fun `an empty catalog carries no layer`() {
        assertThat(AppearanceCatalog.EMPTY.lottieLayers).isEmpty()
    }
}
