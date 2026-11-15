package me.meeshy.sdk.model.appearance

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.pack.PackAssetRef

/*
 * Le catalogue embarqué (#10631, spec § 8.2) — MIROIR de `AppearanceCatalog.swift`,
 * `AvatarRingCatalog` et `BannerFrameCatalog` (iOS), en un seul type : un JSON, un
 * catalogue.
 *
 * `appearance-catalog.json` est une copie OCTET POUR OCTET de la source partagée
 * (`packages/shared/scripts/sync-appearance-catalog-android.ts`, témoin vitest
 * `appearance-catalog-android-copy.test.ts`). Les modèles `builtin` sont donc
 * disponibles sans réseau : le premier rendu du fil a déjà son fond.
 *
 * Lecture INDULGENTE à chaque étage : un champ inconnu ou une version plus récente
 * se tolère ; un modèle illisible tombe SEUL (jamais le pack, jamais le catalogue) ;
 * un catalogue illisible se lit VIDE, jamais en plantage.
 */

/** Les quatre domaines d'apparence que le catalogue embarque ; [wire] est leur segment d'adresse (`/packs/<wire>`). */
enum class AppearancePackDomain(val wire: String) {
    WALLPAPER("wallpaper"),
    BANNER("banner"),
    AVATAR_RING("avatar-ring"),
    BANNER_FRAME("banner-frame"),
}

class AppearanceCatalog private constructor(
    /** La version du format, 1 aujourd'hui ; une version plus récente se lit au mieux. */
    val version: Int,
    val gamut: AppearanceGamut,
    private val embeddedWallpaperPacks: List<AppearanceDesignPack>,
    private val embeddedBannerPacks: List<AppearanceDesignPack>,
    private val embeddedRingPacks: List<AvatarRingPack>,
    private val embeddedBannerFramePacks: List<BannerFramePack>,
    private val strings: Map<String, AppearanceCatalogStrings>,
    /** Les contrats servis des packs non embarqués (#16265) ; vide pour le catalogue de l'APK seul. */
    private val served: ServedAppearanceContracts = ServedAppearanceContracts.EMPTY,
) {

    /** Les packs de fonds : ceux de l'APK, puis les packs servis installés par le lecteur. */
    val wallpaperPacks: List<AppearanceDesignPack> = embeddedWallpaperPacks + servedDesignPacks(AppearancePackDomain.WALLPAPER, embeddedWallpaperPacks)
    val bannerPacks: List<AppearanceDesignPack> = embeddedBannerPacks + servedDesignPacks(AppearancePackDomain.BANNER, embeddedBannerPacks)
    val ringPacks: List<AvatarRingPack> = embeddedRingPacks + servedPacks(AppearancePackDomain.AVATAR_RING, embeddedRingPacks) { pack, order, contract ->
        (contract as? ServedAppearanceContract.Rings)?.let { AvatarRingPack(slug = pack.slug, order = order, rings = it.rings) }
    }
    val bannerFramePacks: List<BannerFramePack> = embeddedBannerFramePacks + servedPacks(AppearancePackDomain.BANNER_FRAME, embeddedBannerFramePacks) { pack, order, contract ->
        (contract as? ServedAppearanceContract.Frames)?.let { BannerFramePack(slug = pack.slug, order = order, frames = it.frames) }
    }

    /**
     * Ce catalogue complété par [contracts] (#16265) : les packs servis installés se rangent APRÈS ceux de l'APK, jamais
     * installés d'office, et un slug déjà embarqué n'est jamais doublé. Les contrats chargés par adresse résolvent le décor
     * d'autrui. Sans contrat, le catalogue reste le même.
     */
    fun withServed(contracts: ServedAppearanceContracts): AppearanceCatalog {
        if (contracts.isEmpty) return this
        return AppearanceCatalog(
            version, gamut, embeddedWallpaperPacks, embeddedBannerPacks, embeddedRingPacks, embeddedBannerFramePacks, strings,
            served.plus(contracts),
        )
    }

    internal fun servedBannerDesign(src: String?, key: String): AppearanceDesign? =
        (served.contract(src, AppearancePackDomain.BANNER) as? ServedAppearanceContract.Designs)?.designs?.firstOrNull { it.key == key }

    internal fun servedRing(src: String?, key: String): AvatarRingDesign? =
        (served.contract(src, AppearancePackDomain.AVATAR_RING) as? ServedAppearanceContract.Rings)?.rings?.firstOrNull { it.key == key }

    internal fun servedBannerFrame(src: String?, key: String): BannerFrameDesign? =
        (served.contract(src, AppearancePackDomain.BANNER_FRAME) as? ServedAppearanceContract.Frames)?.frames?.firstOrNull { it.key == key }

    private fun servedDesignPacks(domain: AppearancePackDomain, embedded: List<AppearancePack>): List<AppearanceDesignPack> =
        servedPacks(domain, embedded) { pack, order, contract ->
            (contract as? ServedAppearanceContract.Designs)?.let { AppearanceDesignPack(slug = pack.slug, order = order, designs = it.designs) }
        }

    private fun <P : AppearancePack> servedPacks(
        domain: AppearancePackDomain,
        embedded: List<AppearancePack>,
        build: (ServedAppearancePack, Int, ServedAppearanceContract) -> P?,
    ): List<P> {
        val taken = embedded.mapTo(HashSet()) { it.slug }
        return served.packs[domain].orEmpty()
            .filter { it.slug !in taken }
            .distinctBy { it.slug }
            .mapIndexedNotNull { index, pack -> served.contract(pack.src, domain)?.let { build(pack, SERVED_ORDER_BASE + index, it) } }
    }

    val isEmpty: Boolean
        get() = gamut.entries.isEmpty() && wallpaperPacks.isEmpty() && bannerPacks.isEmpty() &&
            ringPacks.isEmpty() && bannerFramePacks.isEmpty()

    // region Recherche

    /** Le fond d'un couple (pack, modèle) ; un modèle inconnu résout [WallpaperDesign.Signature]. */
    fun wallpaper(pack: String, design: String): WallpaperDesign {
        val found = wallpaperPacks.firstOrNull { it.slug == pack }?.designs?.firstOrNull { it.key == design }
        return found?.let { WallpaperDesign.Designed(packSlug = pack, design = it) } ?: WallpaperDesign.Signature
    }

    /** Une bannière de design ; `null` pour un modèle inconnu. */
    fun bannerDesign(pack: String, design: String): AppearanceDesign? =
        bannerPacks.firstOrNull { it.slug == pack }?.designs?.firstOrNull { it.key == design }

    fun ring(pack: String, item: String): AvatarRingDesign? =
        ringPacks.firstOrNull { it.slug == pack }?.rings?.firstOrNull { it.key == item }

    fun bannerFrame(pack: String, item: String): BannerFrameDesign? =
        bannerFramePacks.firstOrNull { it.slug == pack }?.frames?.firstOrNull { it.key == item }

    /**
     * Les couches animées que le catalogue référence (#13952), une par empreinte, dans l'ordre fonds, bannières,
     * contours (couche du contour, puis films arrière et avant d'un cadre illustré, #13960), cadres de bannière : celles que le SDK embarque pour qu'elles jouent dès le premier rendu, sans réseau.
     */
    val lottieLayers: List<PackAssetRef>
        get() = (
            wallpaperPacks.flatMap { pack -> pack.designs.mapNotNull { it.lottie } } +
                bannerPacks.flatMap { pack -> pack.designs.mapNotNull { it.lottie } } +
                ringPacks.flatMap { pack -> pack.rings.flatMap { listOfNotNull(it.lottie, it.decor?.back, it.decor?.front) } } +
                bannerFramePacks.flatMap { pack -> pack.frames.mapNotNull { it.lottie } }
            ).distinctBy { it.sha256 }

    // endregion

    // region Packs installés d'office, packs retirables

    fun packs(domain: AppearancePackDomain): List<AppearancePack> = when (domain) {
        AppearancePackDomain.WALLPAPER -> wallpaperPacks
        AppearancePackDomain.BANNER -> bannerPacks
        AppearancePackDomain.AVATAR_RING -> ringPacks
        AppearancePackDomain.BANNER_FRAME -> bannerFramePacks
    }

    /** Les packs que le sélecteur montre d'emblée, sans attendre le réseau : ceux installés par défaut. */
    fun defaultInstalledPacks(domain: AppearancePackDomain): List<AppearancePack> =
        packs(domain).filter { it.installedByDefault }

    /** Les packs que le lecteur peut retirer ; les autres (Essentiels…) sont inclus, le serveur refuse de les retirer. */
    fun removablePacks(domain: AppearancePackDomain): List<AppearancePack> =
        packs(domain).filter { it.removable }

    /** Les modèles de fond à présenter d'emblée : ceux des packs installés par défaut. */
    val defaultWallpapers: List<WallpaperDesign.Designed>
        get() = wallpaperPacks.filter { it.installedByDefault }.flatMap { pack ->
            pack.designs.map { WallpaperDesign.Designed(packSlug = pack.slug, design = it) }
        }

    // endregion

    // region Noms (7 langues)

    fun designName(key: String, language: String): String? = localized(language) { it.designs[key] }

    fun ringName(key: String, language: String): String? = localized(language) { it.rings[key] }

    fun frameName(key: String, language: String): String? = localized(language) { it.frames[key] }

    fun gamutName(key: String, language: String): String? = localized(language) { it.gamut[key] }

    fun packName(slug: String, language: String): String? = localized(language) { it.packNames[slug] } ?: servedPackName(slug, language)

    fun packDescription(slug: String, language: String): String? =
        localized(language) { it.packDescriptions[slug] }

    /**
     * Langue demandée (ses deux premières lettres : `pt-BR` ⇒ `pt`), puis anglais, puis français — la
     * source du catalogue —, puis rien.
     *
     * iOS passe directement au français : sa langue de développement est le français, donc une
     * langue non servie y affiche le français. La langue par défaut d'Android est l'anglais
     * (`values/`), si bien que le repli du nom d'un pack suit celle de l'interface autour de lui.
     * Le catalogue embarqué est complet dans ses sept langues : le repli ne joue que pour une langue
     * hors des sept, ou pour une copie d'un catalogue plus récent.
     */
    private fun localized(language: String, pick: (AppearanceCatalogStrings) -> String?): String? =
        languageChain(language).firstNotNullOfOrNull { strings[it]?.let(pick) }

    /** Le nom d'un pack servi, tiré de son résumé (`names`), dans le même ordre de repli que le catalogue. */
    private fun servedPackName(slug: String, language: String): String? {
        val names = served.packs.values.asSequence().flatten().firstOrNull { it.slug == slug }?.names ?: return null
        return languageChain(language).firstNotNullOfOrNull { names[it] }
    }

    private fun languageChain(language: String): Sequence<String> =
        sequenceOf(language.take(LANGUAGE_CODE_LENGTH).lowercase(), FALLBACK_LANGUAGE, SOURCE_LANGUAGE)

    // endregion

    companion object {
        /** L'anglais est la langue par défaut de l'interface Android : le premier repli d'un nom absent. */
        const val FALLBACK_LANGUAGE = "en"

        /** Le français est la langue source du catalogue : le dernier repli, celui d'iOS. */
        const val SOURCE_LANGUAGE = "fr"
        private const val LANGUAGE_CODE_LENGTH = 2
        private const val DEFAULT_VERSION = 1

        /** Les packs servis se rangent après ceux de l'APK (miroir de `SERVED_ORDER_BASE`, web). */
        private const val SERVED_ORDER_BASE = 1000

        val EMPTY = AppearanceCatalog(
            version = DEFAULT_VERSION,
            gamut = AppearanceGamut.EMPTY,
            embeddedWallpaperPacks = emptyList(),
            embeddedBannerPacks = emptyList(),
            embeddedRingPacks = emptyList(),
            embeddedBannerFramePacks = emptyList(),
            strings = emptyMap(),
        )

        private val JSON = Json { ignoreUnknownKeys = true }

        /**
         * Le catalogue de [text]. Lève [SerializationException] quand ce n'est pas un objet JSON ;
         * toute section illisible, tout modèle illisible se lit vide ou tombe seul.
         */
        fun decode(text: String): AppearanceCatalog {
            val root = JSON.parseToJsonElement(text) as? JsonObject
                ?: throw SerializationException("le catalogue d'apparence n'est pas un objet JSON")
            return AppearanceCatalog(
                version = (root["version"] as? JsonPrimitive)?.intOrNull ?: DEFAULT_VERSION,
                gamut = AppearanceGamut(
                    JSON.decodeLossyList(root["gamut"], AppearanceGamutEntry.serializer()).filter { it.isReadable },
                ),
                embeddedWallpaperPacks = JSON.decodeLossyList(root["wallpapers"], AppearanceDesignPack.serializer()).byOrder(),
                embeddedBannerPacks = JSON.decodeLossyList(root["banners"], AppearanceDesignPack.serializer()).byOrder(),
                embeddedRingPacks = JSON.decodeLossyList(root["rings"], AvatarRingPack.serializer()).byOrder(),
                embeddedBannerFramePacks = JSON.decodeLossyList(root["bannerFrames"], BannerFramePack.serializer()).byOrder(),
                strings = AppearanceCatalogStrings.byLanguage(root["strings"]),
            )
        }

        /** Le catalogue de [text], ou [EMPTY] — jamais un plantage — quand il est illisible ; [onError] reçoit la cause. */
        fun decodeOrEmpty(text: String, onError: (Throwable) -> Unit = {}): AppearanceCatalog =
            try {
                decode(text)
            } catch (e: IllegalArgumentException) {
                onError(e)
                EMPTY
            } catch (e: IllegalStateException) {
                onError(e)
                EMPTY
            }

        private fun <P : AppearancePack> List<P>.byOrder(): List<P> = sortedBy { it.order }
    }
}

/** Les chaînes d'UNE langue : chaque table se lit toute seule, une entrée de travers ne coûte que la sienne. */
internal class AppearanceCatalogStrings(
    val packNames: Map<String, String>,
    val packDescriptions: Map<String, String>,
    val designs: Map<String, String>,
    val rings: Map<String, String>,
    val frames: Map<String, String>,
    val gamut: Map<String, String>,
) {
    companion object {
        fun byLanguage(element: JsonElement?): Map<String, AppearanceCatalogStrings> {
            val languages = element as? JsonObject ?: return emptyMap()
            return languages.mapNotNull { (code, text) -> (text as? JsonObject)?.let { code to from(it) } }.toMap()
        }

        private fun from(text: JsonObject): AppearanceCatalogStrings {
            val packs = text["packs"] as? JsonObject
            return AppearanceCatalogStrings(
                packNames = packs.pick("name"),
                packDescriptions = packs.pick("description"),
                designs = table(text["designs"]),
                rings = table(text["rings"]),
                frames = table(text["frames"]),
                gamut = table(text["gamut"]),
            )
        }

        private fun table(element: JsonElement?): Map<String, String> =
            (element as? JsonObject).orEmpty().mapNotNull { (key, value) -> value.text()?.let { key to it } }.toMap()

        /** `packs.<slug>.<field>` pour chaque pack qui le sert en chaîne. */
        private fun JsonObject?.pick(field: String): Map<String, String> =
            orEmpty().mapNotNull { (slug, pack) -> (pack as? JsonObject)?.get(field).text()?.let { slug to it } }.toMap()

        private fun JsonElement?.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
    }
}
