package me.meeshy.sdk.model.appearance

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

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
    val wallpaperPacks: List<AppearanceDesignPack>,
    val bannerPacks: List<AppearanceDesignPack>,
    val ringPacks: List<AvatarRingPack>,
    val bannerFramePacks: List<BannerFramePack>,
    private val strings: Map<String, AppearanceCatalogStrings>,
) {

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

    fun packName(slug: String, language: String): String? = localized(language) { it.packNames[slug] }

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
    private fun localized(language: String, pick: (AppearanceCatalogStrings) -> String?): String? {
        val code = language.take(LANGUAGE_CODE_LENGTH).lowercase()
        return sequenceOf(code, FALLBACK_LANGUAGE, SOURCE_LANGUAGE).firstNotNullOfOrNull { strings[it]?.let(pick) }
    }

    // endregion

    companion object {
        /** L'anglais est la langue par défaut de l'interface Android : le premier repli d'un nom absent. */
        const val FALLBACK_LANGUAGE = "en"

        /** Le français est la langue source du catalogue : le dernier repli, celui d'iOS. */
        const val SOURCE_LANGUAGE = "fr"
        private const val LANGUAGE_CODE_LENGTH = 2
        private const val DEFAULT_VERSION = 1

        val EMPTY = AppearanceCatalog(
            version = DEFAULT_VERSION,
            gamut = AppearanceGamut.EMPTY,
            wallpaperPacks = emptyList(),
            bannerPacks = emptyList(),
            ringPacks = emptyList(),
            bannerFramePacks = emptyList(),
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
                wallpaperPacks = JSON.decodeLossyList(root["wallpapers"], AppearanceDesignPack.serializer()).byOrder(),
                bannerPacks = JSON.decodeLossyList(root["banners"], AppearanceDesignPack.serializer()).byOrder(),
                ringPacks = JSON.decodeLossyList(root["rings"], AvatarRingPack.serializer()).byOrder(),
                bannerFramePacks = JSON.decodeLossyList(root["bannerFrames"], BannerFramePack.serializer()).byOrder(),
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
