package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import java.security.MessageDigest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import org.junit.Test

/**
 * Un pack d'apparence NON embarqué se peint depuis son contrat servi (#16265) : le contrat se lit, son adresse se
 * vérifie par l'empreinte, et le catalogue qui le reçoit le résout comme un pack embarqué — mêmes renderers, aucun jumeau.
 */
class ServedAppearanceContractTest {

    private val embeddedText = AppearanceFixtures.embeddedCatalogText()
    private val catalog = AppearanceCatalog.decode(embeddedText)
    private val root = AppearanceFixtures.parse(embeddedText)

    private fun firstItems(section: String, field: String): JsonArray =
        ((root[section] as JsonArray).first() as JsonObject)[field] as JsonArray

    private fun contract(domain: String, field: String, items: JsonArray): String =
        buildJsonObject {
            put("domain", domain)
            put(field, items)
        }.toString()

    private val wallpaperText = contract("wallpaper", "designs", firstItems("wallpapers", "designs"))
    private val bannerText = contract("banner", "designs", firstItems("banners", "designs"))
    private val ringText = contract("avatar-ring", "rings", firstItems("rings", "rings"))
    private val frameText = contract("banner-frame", "frames", firstItems("bannerFrames", "frames"))

    private fun sha256(text: String): String =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun address(text: String): String = sha256(text).take(16) + ".json"

    private fun served(domain: AppearancePackDomain, slug: String, text: String, names: Map<String, String> = emptyMap()): ServedAppearanceContracts {
        val src = address(text)
        val parsed = checkNotNull(ServedAppearanceContract.parse(text))
        return ServedAppearanceContracts(
            byAddress = mapOf(src to parsed),
            packs = mapOf(domain to listOf(ServedAppearancePack(slug = slug, src = src, names = names))),
        )
    }

    // region Lecture du contrat

    @Test
    fun `un contrat de fonds se lit avec ses modeles`() {
        val parsed = ServedAppearanceContract.parse(wallpaperText)

        assertThat(parsed).isInstanceOf(ServedAppearanceContract.Designs::class.java)
        parsed as ServedAppearanceContract.Designs
        assertThat(parsed.domain).isEqualTo(AppearancePackDomain.WALLPAPER)
        assertThat(parsed.designs.map { it.key }).isEqualTo(catalog.wallpaperPacks.first().designs.map { it.key })
    }

    @Test
    fun `les contrats de bannieres, de contours et de cadres se lisent chacun dans leur domaine`() {
        assertThat(ServedAppearanceContract.parse(bannerText)?.domain).isEqualTo(AppearancePackDomain.BANNER)
        assertThat(ServedAppearanceContract.parse(ringText)?.domain).isEqualTo(AppearancePackDomain.AVATAR_RING)
        assertThat(ServedAppearanceContract.parse(frameText)?.domain).isEqualTo(AppearancePackDomain.BANNER_FRAME)
    }

    @Test
    fun `un contrat illisible, d un domaine inconnu ou sans modele ne se lit pas`() {
        listOf(
            "pas du json",
            "[]",
            """{"domain":"sticker","designs":[]}""",
            """{"domain":"wallpaper","designs":[]}""",
            """{"domain":"avatar-ring","rings":[{"key":"illisible"}]}""",
        ).forEach { assertThat(ServedAppearanceContract.parse(it)).isNull() }
    }

    // endregion

    // region Empreinte

    @Test
    fun `l adresse se verifie par l empreinte de son contenu`() {
        val bytes = wallpaperText.toByteArray()
        val src = address(wallpaperText)

        assertThat(ServedAppearanceContract.verifies(src, bytes)).isTrue()
        assertThat(ServedAppearanceContract.verifies(src, bytes, sha256 = sha256(wallpaperText))).isTrue()
    }

    @Test
    fun `un contenu altere, une empreinte complete differente ou une adresse non adressee par contenu sont refuses`() {
        val src = address(wallpaperText)

        assertThat(ServedAppearanceContract.verifies(src, (wallpaperText + " ").toByteArray())).isFalse()
        assertThat(ServedAppearanceContract.verifies(src, wallpaperText.toByteArray(), sha256 = sha256(bannerText))).isFalse()
        assertThat(ServedAppearanceContract.verifies("../etc/passwd", wallpaperText.toByteArray())).isFalse()
        assertThat(ServedAppearanceContract.verifies(src.replace(".json", ".png"), wallpaperText.toByteArray())).isFalse()
    }

    // endregion

    // region Catalogue complété

    @Test
    fun `sans contrat servi le catalogue reste le meme`() {
        assertThat(catalog.withServed(ServedAppearanceContracts.EMPTY)).isSameInstanceAs(catalog)
    }

    @Test
    fun `un pack de fonds servi se resout comme un pack embarque, apres eux, jamais installe d office`() {
        val merged = catalog.withServed(served(AppearancePackDomain.WALLPAPER, "fonds-neige", wallpaperText))
        val key = catalog.wallpaperPacks.first().designs.first().key

        assertThat(merged.wallpaper("fonds-neige", key)).isInstanceOf(WallpaperDesign.Designed::class.java)
        val pack = merged.wallpaperPacks.last()
        assertThat(pack.slug).isEqualTo("fonds-neige")
        assertThat(pack.installedByDefault).isFalse()
        assertThat(merged.defaultWallpapers).isEqualTo(catalog.defaultWallpapers)
    }

    @Test
    fun `le selecteur de fonds propose le pack servi installe et possede`() {
        val merged = catalog.withServed(served(AppearancePackDomain.WALLPAPER, "fonds-neige", wallpaperText))
        val installed = listOf(InstalledPackSummary(slug = "fonds-neige", installed = true, owned = true))

        assertThat(WallpaperPackOptions.packs(installed, merged).map { it.slug }).containsExactly("fonds-neige")
    }

    @Test
    fun `un pack servi qui porte le slug d un pack embarque ne le double pas`() {
        val embeddedSlug = catalog.wallpaperPacks.first().slug
        val merged = catalog.withServed(served(AppearancePackDomain.WALLPAPER, embeddedSlug, wallpaperText))

        assertThat(merged.wallpaperPacks.count { it.slug == embeddedSlug }).isEqualTo(1)
    }

    @Test
    fun `un contrat d un autre domaine que celui du pack ne se peint pas`() {
        val merged = catalog.withServed(served(AppearancePackDomain.WALLPAPER, "fonds-neige", ringText))

        assertThat(merged.wallpaperPacks.map { it.slug }).doesNotContain("fonds-neige")
    }

    @Test
    fun `la feuille Contour et banniere propose contours, bannieres et cadres servis`() {
        val merged = catalog
            .withServed(served(AppearancePackDomain.AVATAR_RING, "contours-noel", ringText))
            .withServed(served(AppearancePackDomain.BANNER, "bannieres-noel", bannerText))
            .withServed(served(AppearancePackDomain.BANNER_FRAME, "cadres-noel", frameText))
        fun owned(slug: String) = listOf(InstalledPackSummary(slug = slug, installed = true, owned = true))

        assertThat(ProfileDecorOptions.rings(owned("contours-noel"), merged).map { it.pack }).containsExactly("contours-noel")
        assertThat(ProfileDecorOptions.banners(owned("bannieres-noel"), merged).map { it.pack }).containsExactly("bannieres-noel")
        assertThat(ProfileDecorOptions.bannerFrames(owned("cadres-noel"), merged).map { it.pack }).containsExactly("cadres-noel")
    }

    @Test
    fun `le nom d un pack servi vient de son resume, dans la langue du lecteur puis en francais`() {
        val merged = catalog.withServed(
            served(AppearancePackDomain.WALLPAPER, "fonds-neige", wallpaperText, names = mapOf("fr" to "Neige", "en" to "Snow")),
        )

        assertThat(merged.packName("fonds-neige", "en-US")).isEqualTo("Snow")
        assertThat(merged.packName("fonds-neige", "fr")).isEqualTo("Neige")
        assertThat(merged.packName("fonds-neige", "de")).isEqualTo("Snow")
    }

    // endregion

    // region Décor servi (le mien ou celui d'autrui)

    private fun contractItem(text: String, item: String, pack: String = "pack-d-autrui") =
        ServedProfileDecorItem(pack = pack, item = item, origin = PackOrigin.OFFICIAL, contract = address(text))

    @Test
    fun `le contour d autrui adresse par contrat se peint une fois son contrat charge`() {
        val ringKey = catalog.ringPacks.first().rings.first().key
        val item = contractItem(ringText, ringKey)
        val bare = ServedAppearanceContracts(byAddress = mapOf(address(ringText) to checkNotNull(ServedAppearanceContract.parse(ringText))))

        assertThat(ProfileDecorResolver.ring(item, catalog)).isNull()
        assertThat(ProfileDecorResolver.ring(item, catalog.withServed(bare))?.key).isEqualTo(ringKey)
    }

    @Test
    fun `la banniere et le cadre d autrui adresses par contrat se peignent depuis leur contrat`() {
        val bannerKey = catalog.bannerPacks.first().designs.first().key
        val frameKey = catalog.bannerFramePacks.first().frames.first().key
        val contracts = ServedAppearanceContracts(
            byAddress = mapOf(
                address(bannerText) to checkNotNull(ServedAppearanceContract.parse(bannerText)),
                address(frameText) to checkNotNull(ServedAppearanceContract.parse(frameText)),
            ),
        )
        val merged = catalog.withServed(contracts)

        assertThat(ProfileDecorResolver.banner(contractItem(bannerText, bannerKey), merged)?.key).isEqualTo(bannerKey)
        assertThat(ProfileDecorResolver.bannerFrame(contractItem(frameText, frameKey), merged)?.key).isEqualTo(frameKey)
        assertThat(ProfileDecorResolver.bannerPaint(null, contractItem(bannerText, bannerKey), merged))
            .isInstanceOf(ProfileBannerPaint.Design::class.java)
    }

    @Test
    fun `un modele absent du contrat charge ne se peint pas, jamais en erreur`() {
        val merged = catalog.withServed(served(AppearancePackDomain.AVATAR_RING, "contours-noel", ringText))

        assertThat(ProfileDecorResolver.ring(contractItem(ringText, "modele-inconnu"), merged)).isNull()
    }

    @Test
    fun `un contrat d un domaine different ne peint pas le cote demande`() {
        val ringKey = catalog.ringPacks.first().rings.first().key
        val contracts = ServedAppearanceContracts(byAddress = mapOf(address(ringText) to checkNotNull(ServedAppearanceContract.parse(ringText))))

        assertThat(ProfileDecorResolver.banner(contractItem(ringText, ringKey), catalog.withServed(contracts))).isNull()
    }

    @Test
    fun `les contrats a charger sont ceux des cotes adresses par contrat qui ne se resolvent pas encore`() {
        val ringKey = catalog.ringPacks.first().rings.first().key
        val bannerKey = catalog.bannerPacks.first().designs.first().key
        val decor = ServedProfileDecor(
            avatarRing = contractItem(ringText, ringKey),
            banner = contractItem(bannerText, bannerKey),
            bannerFrame = ServedProfileDecorItem("cadres-essentiels", "x", PackOrigin.BUILTIN),
        )
        val withRing = catalog.withServed(
            ServedAppearanceContracts(byAddress = mapOf(address(ringText) to checkNotNull(ServedAppearanceContract.parse(ringText)))),
        )

        assertThat(ProfileDecorResolver.missingContracts(decor, catalog)).containsExactly(address(ringText), address(bannerText))
        assertThat(ProfileDecorResolver.missingContracts(decor, withRing)).containsExactly(address(bannerText))
    }

    @Test
    fun `un modele adresse par contrat ne se peint jamais depuis un pack du meme slug, dont la version peut differer`() {
        val pack = catalog.ringPacks.first()
        val item = ServedProfileDecorItem(pack.slug, pack.rings.first().key, PackOrigin.OFFICIAL, contract = "0123456789abcdef.json")

        assertThat(ProfileDecorResolver.ring(item, catalog)).isNull()
        assertThat(ProfileDecorResolver.missingContracts(ServedProfileDecor(avatarRing = item), catalog)).containsExactly("0123456789abcdef.json")
    }

    // endregion

    // region Résumé servi par /packs/<domaine>/installed

    @Test
    fun `le resume d un pack installe porte son origine, son contrat et ses noms`() {
        val sha = sha256(ringText)
        val text = """[{"slug":"contours-noel","installed":true,"origin":"official","name":"Noël",""" +
            """"names":{"en":{"name":"Christmas","description":""}},""" +
            """"contract":{"src":"${sha.take(16)}.json","bytes":${ringText.length},"sha256":"$sha"}},""" +
            """{"slug":"contours-essentiels","installed":true,"origin":"builtin","contract":{"src":"pas-adresse","bytes":1,"sha256":"x"}}]"""

        val packs = AppearanceFixtures.json.decodeFromString(InstalledPackList.serializer(), text).packs

        assertThat(packs.map { it.slug }).containsExactly("contours-noel", "contours-essentiels").inOrder()
        assertThat(packs[0].contract?.src).isEqualTo(address(ringText))
        assertThat(packs[0].isServed).isTrue()
        assertThat(packs[0].localizedNames).containsExactly("fr", "Noël", "en", "Christmas")
        assertThat(packs[1].contract).isNull()
        assertThat(packs[1].isServed).isFalse()
    }

    @Test
    fun `un pack servi non possede, retire ou d un ancien serveur sans origine ne se peint pas depuis un contrat`() {
        val ref = checkNotNull(me.meeshy.sdk.model.pack.PackAssetRef.of(address(ringText), ringText.length.toLong(), sha256(ringText)))
        val base = InstalledPackSummary(slug = "contours-noel", installed = true, origin = "official", contract = ref)

        assertThat(base.isServed).isTrue()
        assertThat(base.copy(owned = false, price = 50).isServed).isFalse()
        assertThat(base.copy(installed = false).isServed).isFalse()
        assertThat(base.copy(origin = null).isServed).isFalse()
    }

    // endregion
}
