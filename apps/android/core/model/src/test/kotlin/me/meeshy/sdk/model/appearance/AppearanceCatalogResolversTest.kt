package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.appearance.AppearanceFixtures.catalog
import me.meeshy.sdk.model.appearance.AppearanceFixtures.gradientJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.pack
import me.meeshy.sdk.model.appearance.AppearanceFixtures.patternJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Test

class AppearanceCatalogResolversTest {

    private fun decode(root: JsonObject): AppearanceCatalog = AppearanceCatalog.decode(root.toString())

    private fun embedded(): AppearanceCatalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    // --- wallpaper(pack, design) : un modèle inconnu se peint Signature -----

    @Test
    fun `a known pack and design resolves to the design with the pack that carries it`() {
        val resolved = embedded().wallpaper(pack = "essentiels", design = "monogramme")

        resolved as WallpaperDesign.Designed
        assertThat(resolved.packSlug).isEqualTo("essentiels")
        assertThat(resolved.design.key).isEqualTo("monogramme")
    }

    @Test
    fun `an unknown design resolves to Signature`() {
        assertThat(embedded().wallpaper("essentiels", "inconnu")).isEqualTo(WallpaperDesign.Signature)
    }

    @Test
    fun `an unknown pack resolves to Signature`() {
        assertThat(embedded().wallpaper("pack-retire", "monogramme")).isEqualTo(WallpaperDesign.Signature)
    }

    @Test
    fun `a design that exists in another pack is not borrowed — Signature, never the neighbour`() {
        assertThat(embedded().wallpaper("heritages", "monogramme")).isEqualTo(WallpaperDesign.Signature)
    }

    @Test
    fun `an empty catalog resolves every wallpaper to Signature`() {
        assertThat(AppearanceCatalog.EMPTY.wallpaper("essentiels", "monogramme")).isEqualTo(WallpaperDesign.Signature)
    }

    @Test
    fun `the first of two designs sharing a key wins`() {
        val first = patternJson("double")
        val second = gradientJson("double")
        val decoded = decode(catalog(wallpapers = listOf(pack("essentiels", "designs", first, second))))

        val resolved = decoded.wallpaper("essentiels", "double") as WallpaperDesign.Designed

        assertThat(resolved.design.style).isEqualTo(AppearanceDesignStyle.PATTERN)
    }

    @Test
    fun `banner designs, rings and frames are found by pack and key and null when unknown`() {
        val catalog = embedded()

        assertThat(catalog.bannerDesign("bannieres-essentielles", catalog.bannerPacks.first().designs.first().key)).isNotNull()
        assertThat(catalog.bannerDesign("bannieres-essentielles", "inconnu")).isNull()
        assertThat(catalog.ring("contours-essentiels", "filet")).isNotNull()
        assertThat(catalog.ring("contours-essentiels", "haussmannien")).isNull()
        assertThat(catalog.bannerFrame("cadres-haussmannien", "haussmannien")).isNotNull()
        assertThat(catalog.bannerFrame("cadres-haussmannien", "arabe")).isNull()
    }

    // --- Les packs installés par défaut et ceux qu'on peut retirer ----------

    @Test
    fun `the wallpaper packs installed by default are Essentiels and Animes`() {
        val defaults = embedded().defaultInstalledPacks(AppearancePackDomain.WALLPAPER)

        assertThat(defaults.map { it.slug }).containsExactly("essentiels", "animes").inOrder()
    }

    @Test
    fun `the packs installed by default are served per domain from the catalog`() {
        val catalog = embedded()

        assertThat(catalog.defaultInstalledPacks(AppearancePackDomain.BANNER).map { it.slug })
            .containsExactly("bannieres-essentielles", "bannieres-animees").inOrder()
        assertThat(catalog.defaultInstalledPacks(AppearancePackDomain.AVATAR_RING).map { it.slug })
            .containsExactly("contours-essentiels", "contours-animes").inOrder()
        assertThat(catalog.defaultInstalledPacks(AppearancePackDomain.BANNER_FRAME).map { it.slug })
            .containsExactly("cadres-haussmannien", "cadres-ancestral").inOrder()
    }

    @Test
    fun `the included packs cannot be removed, the others can`() {
        val catalog = embedded()

        val removable = catalog.removablePacks(AppearancePackDomain.WALLPAPER).map { it.slug }

        assertThat(removable).containsExactly("heritages", "nature-et-ciel", "illustrations", "animes").inOrder()
        assertThat(removable).doesNotContain("essentiels")
    }

    @Test
    fun `a pack without the flags is read not installed and removable`() {
        val bare = AppearanceFixtures.parse("""{"slug":"nu","designs":[]}""")

        val decoded = decode(catalog(wallpapers = listOf(bare)))

        val nu = decoded.wallpaperPacks.single()
        assertThat(nu.installedByDefault).isFalse()
        assertThat(nu.removable).isTrue()
        assertThat(nu.order).isEqualTo(0)
    }

    @Test
    fun `the default wallpapers are the designs of the packs installed by default`() {
        val defaults = embedded().defaultWallpapers

        assertThat(defaults.map { it.packSlug }.distinct()).containsExactly("essentiels", "animes").inOrder()
        assertThat(defaults.map { it.design.key }).containsAtLeast("monogramme", "chevrons", "aurore", "maille")
        assertThat(defaults).hasSize(5)
    }

    @Test
    fun `packs come out ordered by their order field whatever the file order`() {
        val late = pack("tard", "designs", patternJson("a"), order = 5)
        val early = pack("tot", "designs", patternJson("b"), order = 1)

        val decoded = decode(catalog(wallpapers = listOf(late, early)))

        assertThat(decoded.wallpaperPacks.map { it.slug }).containsExactly("tot", "tard").inOrder()
    }

    // --- Noms localisés avec repli ------------------------------------------

    @Test
    fun `a pack name is served in the requested language`() {
        val catalog = embedded()

        assertThat(catalog.packName("essentiels", "en")).isEqualTo("Essentials")
        assertThat(catalog.packName("essentiels", "de")).isEqualTo("Essentials")
        assertThat(catalog.packName("contours-essentiels", "de")).isEqualTo("Basis-Rahmen")
        assertThat(catalog.packName("contours-essentiels", "ar")).isEqualTo("إطارات أساسية")
    }

    @Test
    fun `a regional tag resolves to its language`() {
        val catalog = embedded()

        assertThat(catalog.packName("essentiels", "pt-BR")).isEqualTo("Essenciais")
        assertThat(catalog.packName("essentiels", "pt_PT")).isEqualTo("Essenciais")
        assertThat(catalog.packName("essentiels", "ES")).isEqualTo("Esenciales")
    }

    @Test
    fun `a language the catalog does not carry falls back to French, the source`() {
        val catalog = embedded()

        assertThat(catalog.packName("essentiels", "ja")).isEqualTo("Essentiels")
        assertThat(catalog.packName("essentiels", "")).isEqualTo("Essentiels")
        assertThat(catalog.designName("monogramme", "zh-Hans")).isEqualTo("Monogramme")
    }

    @Test
    fun `a name missing in the requested language falls back to French, not to nothing`() {
        val strings = AppearanceFixtures.strings().with(
            "de" to AppearanceFixtures.parse("""{"packs":{},"designs":{},"rings":{},"frames":{},"gamut":{}}"""),
        )
        val decoded = decode(catalog(strings = strings))

        assertThat(decoded.packName("essentiels", "de")).isEqualTo("Essentiels")
        assertThat(decoded.ringName("filet", "de")).isEqualTo("Filet")
    }

    @Test
    fun `an unknown key has no name`() {
        val catalog = embedded()

        assertThat(catalog.packName("pack-inconnu", "en")).isNull()
        assertThat(catalog.gamutName("magenta", "fr")).isNull()
    }

    @Test
    fun `every kind of item is named in the seven languages`() {
        val catalog = embedded()

        listOf("fr", "en", "es", "pt", "de", "it", "ar").forEach { language ->
            assertThat(catalog.designName("monogramme", language)).isNotEmpty()
            assertThat(catalog.ringName("filet", language)).isNotEmpty()
            assertThat(catalog.frameName("haussmannien", language)).isNotEmpty()
            assertThat(catalog.gamutName("indigo", language)).isNotEmpty()
            assertThat(catalog.packDescription("essentiels", language)).isNotEmpty()
        }
    }

    @Test
    fun `every pack, design, ring, frame and colour of the catalog is named in French`() {
        val catalog = embedded()

        val unnamed = buildList {
            catalog.wallpaperPacks.forEach { pack ->
                if (catalog.packName(pack.slug, "fr") == null) add("pack:${pack.slug}")
                pack.designs.forEach { if (catalog.designName(it.key, "fr") == null) add("design:${it.key}") }
            }
            catalog.bannerPacks.forEach { pack ->
                if (catalog.packName(pack.slug, "fr") == null) add("pack:${pack.slug}")
                pack.designs.forEach { if (catalog.designName(it.key, "fr") == null) add("banner:${it.key}") }
            }
            catalog.ringPacks.forEach { pack ->
                if (catalog.packName(pack.slug, "fr") == null) add("pack:${pack.slug}")
                pack.rings.forEach { if (catalog.ringName(it.key, "fr") == null) add("ring:${it.key}") }
            }
            catalog.bannerFramePacks.forEach { pack ->
                if (catalog.packName(pack.slug, "fr") == null) add("pack:${pack.slug}")
                pack.frames.forEach { if (catalog.frameName(it.key, "fr") == null) add("frame:${it.key}") }
            }
            catalog.gamut.entries.forEach { if (catalog.gamutName(it.key, "fr") == null) add("gamut:${it.key}") }
        }

        assertThat(unnamed).isEmpty()
    }

    // --- La couleur d'un gamut, en clair et en sombre -----------------------

    @Test
    fun `a colour of the gamut is served in light and in dark`() {
        val gamut = embedded().gamut

        assertThat(gamut.surface("indigo", AppearanceScheme.LIGHT)).isEqualTo("#EEF0FF")
        assertThat(gamut.surface("indigo", AppearanceScheme.DARK)).isEqualTo("#14152E")
        assertThat(gamut.accent("indigo", AppearanceScheme.LIGHT)).isEqualTo("#6366F1")
        assertThat(gamut.accent("indigo", AppearanceScheme.DARK)).isEqualTo("#818CF8")
    }

    @Test
    fun `a colour outside the gamut is never invented`() {
        val gamut = embedded().gamut

        assertThat(gamut.contains("magenta")).isFalse()
        assertThat(gamut.surface("magenta", AppearanceScheme.LIGHT)).isNull()
        assertThat(gamut.accent("magenta", AppearanceScheme.DARK)).isNull()
        assertThat(gamut.entry("magenta")).isNull()
    }

    @Test
    fun `the scheme follows the dark flag`() {
        assertThat(AppearanceScheme.of(isDark = true)).isEqualTo(AppearanceScheme.DARK)
        assertThat(AppearanceScheme.of(isDark = false)).isEqualTo(AppearanceScheme.LIGHT)
    }

    @Test
    fun `every colour of the embedded gamut is a well formed hexadecimal in both schemes`() {
        embedded().gamut.entries.forEach { entry ->
            AppearanceScheme.entries.forEach { scheme ->
                assertThat(FrameDecorField.isHex(entry.shade(scheme).surface)).isTrue()
                assertThat(FrameDecorField.isHex(entry.shade(scheme).accent)).isTrue()
            }
        }
    }

    @Test
    fun `a design palette is served per scheme`() {
        val design = embedded().wallpaper("essentiels", "monogramme") as WallpaperDesign.Designed

        assertThat(design.design.palette(AppearanceScheme.LIGHT).base).isEqualTo("#F7F7FB")
        assertThat(design.design.palette(AppearanceScheme.DARK).base).isEqualTo("#0F0E1A")
    }

    @Test
    fun `a reduced catalog serves its ring and its frame`() {
        val decoded = decode(catalog())

        assertThat(decoded.ring("contours-essentiels", "filet")).isNotNull()
        assertThat(decoded.bannerFrame("cadres-haussmannien", "haussmannien")).isNotNull()
    }
}
