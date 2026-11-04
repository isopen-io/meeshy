package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WallpaperPackOptionsTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())
    private val firstPack = catalog.wallpaperPacks.first()

    @Test
    fun `une liste jamais lue propose les packs installes d office`() {
        assertThat(WallpaperPackOptions.packs(null, catalog)).isEqualTo(catalog.wallpaperPacks.filter { it.installedByDefault })
    }

    @Test
    fun `un 404 d un ancien serveur ne laisse aucun pack, Signature la gamme et la photo restent`() {
        val installed = WallpaperPackOptions.installedFromFailure(404)

        assertThat(WallpaperPackOptions.packs(installed, catalog)).isEmpty()
    }

    @Test
    fun `une panne ne conclut rien et garde les packs installes d office`() {
        listOf(500, 503, 401, null).forEach { status ->
            val installed = WallpaperPackOptions.installedFromFailure(status)

            assertThat(installed).isNull()
            assertThat(WallpaperPackOptions.packs(installed, catalog)).isEqualTo(catalog.wallpaperPacks.filter { it.installedByDefault })
        }
    }

    @Test
    fun `le selecteur se limite aux packs possedes ET installes`() {
        val installed = listOf(InstalledPackSummary(slug = firstPack.slug, installed = true, owned = true))

        assertThat(WallpaperPackOptions.packs(installed, catalog).map { it.slug }).containsExactly(firstPack.slug)
    }

    @Test
    fun `un pack installe mais non possede ou possede mais retire n est pas propose`() {
        val notOwned = listOf(InstalledPackSummary(slug = firstPack.slug, installed = true, owned = false, price = 50))
        val removed = listOf(InstalledPackSummary(slug = firstPack.slug, installed = false, owned = true))

        assertThat(WallpaperPackOptions.packs(notOwned, catalog)).isEmpty()
        assertThat(WallpaperPackOptions.packs(removed, catalog)).isEmpty()
    }

    @Test
    fun `un pack inconnu du catalogue embarque est ignore`() {
        val installed = listOf(InstalledPackSummary(slug = "pack-d-une-passerelle-plus-recente", installed = true, owned = true))

        assertThat(WallpaperPackOptions.packs(installed, catalog)).isEmpty()
    }
}
