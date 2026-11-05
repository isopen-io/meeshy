package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13952 — les couches animées que le catalogue embarqué référence : celles qu'Android doit embarquer et jouer. */
class AppearanceCatalogLottieLayersTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    @Test
    fun `the embedded catalog references the nine animated layers, the 72 illustrated films, the 12 Christmas ring films, the 3 Christmas wallpaper films, the 13 living Meeshy layers and the 19 seasonal-offer films, each once`() {
        val layers = catalog.lottieLayers
        assertThat(layers).hasSize(128)
        assertThat(layers.map { it.sha256 }.toSet()).hasSize(128)
    }

    @Test
    fun `the layers are the animated packs' rings, banners and wallpapers, then both films of each illustrated frame, showcase, cultural families and Christmas, the Christmas wallpapers, then the living Meeshy collections, then the seasonal offers`() {
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
        val christmasWallpapers = catalog.wallpaperPacks.single { it.slug == "fonds-noel-vivants" }.designs.map { it.lottie }
        assertThat(christmasWallpapers).hasSize(3)
        val meeshy = catalog.wallpaperPacks.single { it.slug == "meeshy-fonds-vivants" }.designs.map { it.lottie } +
            catalog.ringPacks.single { it.slug == "meeshy-vivants" }.rings.flatMap { listOfNotNull(it.lottie, it.decor?.back, it.decor?.front) }
        assertThat(meeshy).hasSize(13)
        val seasonal = catalog.bannerPacks.filter { it.slug in SEASONAL }.flatMap { pack -> pack.designs.mapNotNull { it.lottie } } +
            catalog.wallpaperPacks.filter { it.slug in SEASONAL }.flatMap { pack -> pack.designs.mapNotNull { it.lottie } } +
            catalog.ringPacks.filter { it.slug in SEASONAL }.flatMap { pack -> pack.rings.flatMap { listOfNotNull(it.lottie, it.decor?.back, it.decor?.front) } }
        assertThat(seasonal).hasSize(19)
        val expected = rings + banners + wallpapers + films + christmas + christmasWallpapers + meeshy + seasonal
        assertThat(expected).doesNotContain(null)
        assertThat(catalog.lottieLayers).containsExactlyElementsIn(expected)
    }

    private companion object {
        /** #16270, #16271 — les packs que les offres de Noël et du Nouvel An ajoutent. */
        val SEASONAL = setOf(
            "noel-bannieres", "noel-contours-fixes", "noel-cadres-fixes",
            "nouvel-an-contours", "nouvel-an-contours-vifs", "nouvel-an-images", "nouvel-an-images-vives",
            "nouvel-an-cadres", "nouvel-an-cadres-vifs", "nouvel-an-fonds", "nouvel-an-fonds-vifs",
        )
    }

    @Test
    fun `an empty catalog carries no layer`() {
        assertThat(AppearanceCatalog.EMPTY.lottieLayers).isEmpty()
    }
}
