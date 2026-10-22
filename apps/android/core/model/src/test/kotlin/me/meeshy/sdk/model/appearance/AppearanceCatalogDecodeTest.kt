package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.appearance.AppearanceFixtures.array
import me.meeshy.sdk.model.appearance.AppearanceFixtures.catalog
import me.meeshy.sdk.model.appearance.AppearanceFixtures.frameJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.gamutEntry
import me.meeshy.sdk.model.appearance.AppearanceFixtures.gradientJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.number
import me.meeshy.sdk.model.appearance.AppearanceFixtures.pack
import me.meeshy.sdk.model.appearance.AppearanceFixtures.patternJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.ringJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.text
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Assert.assertThrows
import org.junit.Test

class AppearanceCatalogDecodeTest {

    private fun decode(root: JsonObject): AppearanceCatalog = AppearanceCatalog.decode(root.toString())

    private fun embedded(): JsonObject = AppearanceFixtures.parse(AppearanceFixtures.embeddedCatalogText())

    // --- Le vrai fichier embarqué ------------------------------------------

    @Test
    fun `the embedded file decodes in full — version 1, sixteen colours, five wallpaper packs, two banner packs, nine ring packs, seven frame packs`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        assertThat(catalog.version).isEqualTo(1)
        assertThat(catalog.gamut.entries).hasSize(16)
        assertThat(catalog.wallpaperPacks).hasSize(5)
        assertThat(catalog.bannerPacks).hasSize(2)
        assertThat(catalog.ringPacks).hasSize(9)
        assertThat(catalog.bannerFramePacks).hasSize(7)
        assertThat(catalog.isEmpty).isFalse()
    }

    @Test
    fun `no design of the embedded file is silently lost — what the file declares is what the catalog serves`() {
        val root = embedded()
        val catalog = AppearanceCatalog.decode(root.toString())

        fun declared(section: String, items: String): List<Int> =
            (root[section] as JsonArray).map { ((it as JsonObject)[items] as JsonArray).size }

        assertThat(catalog.wallpaperPacks.map { it.designs.size }).isEqualTo(declared("wallpapers", "designs"))
        assertThat(catalog.bannerPacks.map { it.designs.size }).isEqualTo(declared("banners", "designs"))
        assertThat(catalog.ringPacks.map { it.rings.size }).isEqualTo(declared("rings", "rings"))
        assertThat(catalog.bannerFramePacks.map { it.frames.size }).isEqualTo(declared("bannerFrames", "frames"))
        assertThat(catalog.wallpaperPacks.sumOf { it.designs.size }).isEqualTo(15)
        assertThat(catalog.bannerPacks.sumOf { it.designs.size }).isEqualTo(7)
        assertThat(catalog.ringPacks.sumOf { it.rings.size }).isEqualTo(21)
        assertThat(catalog.bannerFramePacks.sumOf { it.frames.size }).isEqualTo(14)
    }

    @Test
    fun `the embedded file serves the sixteen colours in their declared order`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        assertThat(catalog.gamut.entries.map { it.key }).containsExactly(
            "indigo", "bleu-nuit", "azur", "lagon", "emeraude", "olive", "moutarde", "sable",
            "terracotta", "corail", "rose-poudre", "framboise", "prune", "lavande", "ardoise", "graphite",
        ).inOrder()
    }

    @Test
    fun `the embedded file carries the names of the seven languages`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        val names = listOf("fr", "en", "es", "pt", "de", "it", "ar").map { catalog.packName("essentiels", it) }

        assertThat(names).containsExactly("Essentiels", "Essentials", "Esenciales", "Essenciais", "Essentials", "Essenziali", "الأساسيات")
            .inOrder()
    }

    @Test
    fun `the packs of the embedded file come out in their declared order`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        assertThat(catalog.wallpaperPacks.map { it.slug })
            .containsExactly("essentiels", "heritages", "nature-et-ciel", "illustrations", "animes").inOrder()
        assertThat(catalog.wallpaperPacks.map { it.order }).isInStrictOrder()
    }

    @Test
    fun `the animated layer of an embedded design is read as a content-addressed file`() {
        val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

        val animated = catalog.wallpaperPacks.flatMap { it.designs }.filter { it.lottie != null }

        assertThat(animated).isNotEmpty()
        animated.forEach { design ->
            val layer = design.lottie!!
            assertThat(layer.src).endsWith(".json")
            assertThat(layer.sha256).startsWith(layer.src.substringBefore('.'))
        }
    }

    // --- Tolérance : un élément illisible tombe seul -----------------------

    @Test
    fun `a design with an unknown style costs only itself, never its pack nor the catalog`() {
        val unknownStyle = patternJson("futur").with("style" to text("hologramme"))
        val root = catalog(wallpapers = listOf(pack("essentiels", "designs", patternJson("monogramme"), unknownStyle, gradientJson("aurore"))))

        val designs = decode(root).wallpaperPacks.single().designs

        assertThat(designs.map { it.key }).containsExactly("monogramme", "aurore").inOrder()
    }

    @Test
    fun `a design whose palette is not hexadecimal is dropped alone`() {
        val badPalette = patternJson("sale").with(
            "palettes" to AppearanceFixtures.parse(
                """{"light":{"base":"rouge","ink":"#000000","soft":"#FFFFFF"},"dark":{"base":"#000000","ink":"#FFFFFF","soft":"#111111"}}""",
            ),
        )
        val root = catalog(wallpapers = listOf(pack("essentiels", "designs", badPalette, patternJson("propre"))))

        assertThat(decode(root).wallpaperPacks.single().designs.map { it.key }).containsExactly("propre")
    }

    @Test
    fun `a design whose block does not match its style is dropped alone`() {
        val noTile = patternJson("vide").with("tile" to null)
        val root = catalog(wallpapers = listOf(pack("essentiels", "designs", noTile, patternJson("propre"))))

        assertThat(decode(root).wallpaperPacks.single().designs.map { it.key }).containsExactly("propre")
    }

    @Test
    fun `a design with an unreadable animated layer keeps its drawing and loses only the layer`() {
        val badLayer = patternJson("anime").with(
            "lottie" to AppearanceFixtures.parse("""{"src":"pas-une-empreinte.json","bytes":10,"sha256":"zz"}"""),
        )
        val root = catalog(wallpapers = listOf(pack("animes", "designs", badLayer)))

        val design = decode(root).wallpaperPacks.single().designs.single()

        assertThat(design.key).isEqualTo("anime")
        assertThat(design.lottie).isNull()
    }

    @Test
    fun `a pack that is not an object costs only itself`() {
        val root = catalog(wallpapers = listOf(text("pas un pack"), pack("essentiels", "designs", patternJson("monogramme"))))

        assertThat(decode(root).wallpaperPacks.map { it.slug }).containsExactly("essentiels")
    }

    @Test
    fun `a pack without its design list is read empty rather than refused`() {
        val noList = pack("essentiels", "designs", patternJson("monogramme")).with("designs" to null)

        val packs = decode(catalog(wallpapers = listOf(noList))).wallpaperPacks

        assertThat(packs.single().designs).isEmpty()
    }

    @Test
    fun `a colour entry without its dark shade is dropped alone`() {
        val broken = gamutEntry("casse").with("dark" to null)
        val root = catalog(gamut = listOf(gamutEntry("indigo"), broken, gamutEntry("lagon")))

        assertThat(decode(root).gamut.entries.map { it.key }).containsExactly("indigo", "lagon").inOrder()
    }

    @Test
    fun `a colour entry whose shade is not hexadecimal is dropped alone`() {
        val dirty = gamutEntry("sale").with(
            "light" to AppearanceFixtures.parse("""{"surface":"blanc","accent":"#6366F1"}"""),
        )

        assertThat(decode(catalog(gamut = listOf(dirty, gamutEntry("indigo")))).gamut.entries.map { it.key })
            .containsExactly("indigo")
    }

    @Test
    fun `a ring or a frame that cannot be read costs only itself`() {
        val badRing = ringJson("sale").with(
            "stroke" to AppearanceFixtures.parse("""{"style":"solid","width":0.03,"colors":["pas-un-hex"]}"""),
        )
        val badFrame = frameJson("sale").with("viewBox" to array(number(0), number(0), number(200), number(100)))
        val root = catalog(
            rings = listOf(pack("contours-essentiels", "rings", badRing, ringJson("filet"))),
            bannerFrames = listOf(pack("cadres-haussmannien", "frames", badFrame, frameJson("haussmannien"))),
        )

        val decoded = decode(root)

        assertThat(decoded.ringPacks.single().rings.map { it.key }).containsExactly("filet")
        assertThat(decoded.bannerFramePacks.single().frames.map { it.key }).containsExactly("haussmannien")
    }

    @Test
    fun `a malformed language block costs only that language`() {
        val strings = AppearanceFixtures.strings().with("en" to text("cassé"))

        val decoded = decode(catalog(strings = strings))

        assertThat(decoded.packName("essentiels", "fr")).isEqualTo("Essentiels")
        assertThat(decoded.packName("essentiels", "en")).isEqualTo("Essentiels")
        assertThat(decoded.packName("essentiels", "de")).isEqualTo("Essentiels")
    }

    @Test
    fun `a missing section is read empty and the others stay`() {
        val root = catalog().with("rings" to null, "gamut" to text("pas un tableau"))

        val decoded = decode(root)

        assertThat(decoded.ringPacks).isEmpty()
        assertThat(decoded.gamut.entries).isEmpty()
        assertThat(decoded.wallpaperPacks).hasSize(1)
        assertThat(decoded.isEmpty).isFalse()
    }

    // --- Lecture indulgente : champs inconnus, version plus récente --------

    @Test
    fun `unknown fields at every level and a newer version are tolerated`() {
        val future = patternJson("futur").with("holographic" to text("oui"))
        val root = catalog(
            wallpapers = listOf(pack("essentiels", "designs", future).with("sponsor" to text("acme"))),
            version = 7,
        ).with("telemetry" to JsonObject(emptyMap()))

        val decoded = decode(root)

        assertThat(decoded.version).isEqualTo(7)
        assertThat(decoded.wallpaperPacks.single().designs.map { it.key }).containsExactly("futur")
    }

    @Test
    fun `a catalog without a version is read as version 1`() {
        assertThat(decode(catalog().with("version" to null)).version).isEqualTo(1)
    }

    @Test
    fun `a fragment of the catalog is enough to decode`() {
        val decoded = AppearanceCatalog.decode("""{"wallpapers":[]}""")

        assertThat(decoded.wallpaperPacks).isEmpty()
        assertThat(decoded.version).isEqualTo(1)
    }

    // --- Un catalogue illisible est vide, jamais un plantage ---------------

    @Test
    fun `a catalog that is not JSON reads empty and reports why`() {
        val errors = mutableListOf<Throwable>()

        val decoded = AppearanceCatalog.decodeOrEmpty("{pas du json") { errors += it }

        assertThat(decoded).isSameInstanceAs(AppearanceCatalog.EMPTY)
        assertThat(decoded.isEmpty).isTrue()
        assertThat(errors).hasSize(1)
    }

    @Test
    fun `a catalog that is not an object reads empty and reports why`() {
        val errors = mutableListOf<Throwable>()

        val decoded = AppearanceCatalog.decodeOrEmpty("[1,2,3]") { errors += it }

        assertThat(decoded.isEmpty).isTrue()
        assertThat(errors.single()).isInstanceOf(SerializationException::class.java)
    }

    @Test
    fun `an empty text reads empty`() {
        assertThat(AppearanceCatalog.decodeOrEmpty("").isEmpty).isTrue()
    }

    @Test
    fun `a readable catalog reports nothing`() {
        val errors = mutableListOf<Throwable>()

        AppearanceCatalog.decodeOrEmpty(catalog().toString()) { errors += it }

        assertThat(errors).isEmpty()
    }

    @Test
    fun `strict decoding of a text that is not an object refuses it`() {
        assertThrows(SerializationException::class.java) { AppearanceCatalog.decode("[]") }
    }
}
