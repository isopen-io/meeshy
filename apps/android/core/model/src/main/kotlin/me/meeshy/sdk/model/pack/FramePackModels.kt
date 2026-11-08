package me.meeshy.sdk.model.pack

import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.GloryFramePlacement

/*
 * LES PACKS DE CADRES, TELS QUE `/packs/glory-frame` LES SERT (#10148, #10157) — miroir de `FramePackModels.swift`
 * et de `glory-frame-pack.ts`. Lecture TOLÉRANTE champ par champ (sauf le slug) : un champ ou une surface d'une version
 * future ne fait jamais tomber le pack, et un usage illisible se lit `null` (le pack se montre, son libellé se tait).
 * Les cadres de bannière (centre transparent) et les contours d'avatar passent par les MÊMES types : seule leur
 * surface libre diffère.
 */

/** L'état éditorial d'un pack ; un état futur se lit [UNKNOWN]. */
enum class PackStatus(val wire: String) {
    PENDING("pending"),
    APPROVED("approved"),
    REJECTED("rejected"),
    UNKNOWN("unknown"),
    ;

    companion object {
        fun from(raw: String?): PackStatus = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

/**
 * Ce qu'il faut pour lire un fichier de pack et le vérifier : son nom, et son empreinte entière quand on la connaît.
 * La couverture d'un pack n'arrive que par son adresse : seul le préfixe de 16 caractères que porte son nom peut alors
 * être vérifié.
 */
data class PackAssetFile internal constructor(val name: String, val sha256: String?) {

    /** Les 16 caractères hexadécimaux que le nom engage. */
    val namedPrefix: String get() = name.take(16)

    companion object {
        fun of(name: String, sha256: String? = null): PackAssetFile? {
            if (!PackAssetRef.isContentAddressed(name)) return null
            if (sha256 != null && !(PackAssetRef.isHex(sha256, 64) && name.startsWith(sha256.take(16)))) return null
            return PackAssetFile(name, sha256)
        }

        /** `/api/v1/pack-assets/<sha16>.webp` (ou son URL absolue) ⇒ le fichier ; toute autre adresse ⇒ `null`. */
        fun ofServedPath(servedPath: String?): PackAssetFile? {
            val path = servedPath?.let { runCatching { URI(it).path }.getOrNull() } ?: return null
            val parts = path.split('/').filter { it.isNotEmpty() }
            if (parts.size < 2 || parts[parts.size - 2] != "pack-assets") return null
            return of(parts.last())
        }
    }
}

data class PackLocalizedName(val name: String, val description: String = "")

data class FramePackCollection(val slug: String, val usage: FrameUsage?)

/** Un pack de cadres, résumé (boutique) ou détaillé : le résumé est un détail sans contrat. */
data class FramePack(
    override val slug: String,
    val name: String,
    val description: String = "",
    val author: String = "Meeshy",
    val isBuiltin: Boolean = false,
    val status: PackStatus = PackStatus.APPROVED,
    val itemCount: Int = 0,
    /** RELATIF (`/api/v1/pack-assets/<sha16>.webp`) : à lire par [coverFile]. */
    val coverUrl: String? = null,
    override val installed: Boolean = false,
    override val installCount: Int = 0,
    val origin: PackOrigin = PackOrigin.OFFICIAL,
    val version: Int = 1,
    val removable: Boolean = true,
    val names: Map<String, PackLocalizedName> = emptyMap(),
    val preview: PackAssetRef? = null,
    val usage: FrameUsage? = null,
    val contractSchema: Int? = null,
    val contract: PackAssetRef? = null,
    val strings: Map<String, PackAssetRef> = emptyMap(),
    val collections: List<FramePackCollection> = emptyList(),
) : InstallablePack<FramePack> {

    override val isBundled: Boolean get() = isBuiltin || origin == PackOrigin.BUILTIN

    val coverFile: PackAssetFile? get() = PackAssetFile.ofServedPath(coverUrl)

    override fun withInstall(installed: Boolean, installCount: Int): FramePack =
        copy(installed = installed, installCount = installCount)

    /** Le nom dans la langue du lecteur, sinon celui que sert la passerelle. */
    fun localizedName(language: String): String = names[packLanguage(language)]?.name ?: name

    fun localizedDescription(language: String): String = names[packLanguage(language)]?.description ?: description

    /** Les chaînes des cadres : la langue du lecteur, sinon le français. */
    fun stringsRef(language: String): PackAssetRef? = strings[packLanguage(language)] ?: strings["fr"]

    companion object {
        /** `pt-BR` ⇒ `pt` : les packs nomment leurs langues par leur code court. */
        fun packLanguage(language: String): String =
            language.lowercase().split('-', '_').firstOrNull()?.takeIf { it.isNotEmpty() } ?: "fr"

        /** Lit un pack ; seul un slug absent le fait tomber. */
        fun parse(element: JsonElement?): FramePack? = FramePackReader.read(element)
    }
}

internal object FramePackReader {

    fun read(element: JsonElement?): FramePack? {
        val obj = element as? JsonObject ?: return null
        val slug = obj.string("slug") ?: return null
        return FramePack(
            slug = slug,
            name = obj.string("name") ?: slug,
            description = obj.string("description").orEmpty(),
            author = obj.string("author").orEmpty(),
            isBuiltin = obj.bool("builtin") ?: false,
            status = PackStatus.from(obj.string("status")),
            itemCount = obj.int("itemCount") ?: 0,
            coverUrl = obj.string("coverUrl"),
            installed = obj.bool("installed") ?: false,
            installCount = obj.int("installCount") ?: 0,
            origin = PackOrigin.from(obj.string("origin")),
            version = obj.int("version") ?: 0,
            removable = obj.bool("removable") ?: true,
            names = lossyMap(obj["names"], ::localizedName),
            preview = assetRef(obj["preview"]),
            usage = FrameUsageWire.parseUsage(obj["usage"]),
            contractSchema = obj.int("contractSchema"),
            contract = assetRef(obj["contract"]),
            strings = lossyMap(obj["strings"], ::assetRef),
            collections = (obj["collections"] as? JsonArray).orEmpty().mapNotNull(::collection),
        )
    }

    fun assetRef(element: JsonElement?): PackAssetRef? {
        val obj = element as? JsonObject ?: return null
        val src = obj.string("src") ?: return null
        val sha = obj.string("sha256") ?: return null
        val bytes = obj.long("bytes") ?: return null
        return PackAssetRef.of(src, bytes, sha)
    }

    private fun localizedName(element: JsonElement?): PackLocalizedName? {
        val obj = element as? JsonObject ?: return null
        return PackLocalizedName(obj.string("name") ?: return null, obj.string("description").orEmpty())
    }

    private fun collection(element: JsonElement?): FramePackCollection? {
        val obj = element as? JsonObject ?: return null
        return FramePackCollection(obj.string("slug") ?: return null, FrameUsageWire.parseUsage(obj["usage"]))
    }

    private fun <V : Any> lossyMap(element: JsonElement?, read: (JsonElement?) -> V?): Map<String, V> =
        (element as? JsonObject).orEmpty().mapNotNull { (key, value) -> read(value)?.let { key to it } }.toMap()

    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull

    private fun JsonObject.long(key: String): Long? = (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.contentOrNull?.toLongOrNull()

    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.contentOrNull
        ?.let { if (it == "true") true else if (it == "false") false else null }
}

// MARK: - Le contrat d'un pack de cadres (`glory-frame-pack.ts`)

/**
 * Un cadre du contrat : son usage (jamais libre), sa vignette adressée par contenu et les CLÉS de son nom, que les
 * chaînes de la langue traduisent. [placement] : où le cadre se range dans la loi ; `null` s'il manque ou contredit
 * l'usage — il ne se propose alors à aucune étape.
 */
data class GloryFramePackFrame(
    val id: String,
    val usage: FrameUsage,
    val thumb: PackAssetRef,
    val nameKey: String,
    val storyKey: String? = null,
    val placement: GloryFramePlacement? = null,
)

data class GloryFramePackContract(val frames: List<GloryFramePackFrame>) {

    companion object {
        const val SCHEMA = 1
        const val MAX_FRAME_ID_LENGTH = 64

        /**
         * `parseGloryFramePackContract` : `null` pour une version inconnue ou une forme illisible (« Mettre à jour
         * Meeshy », et rien ne se télécharge). Sinon les cadres lisibles, dans l'ordre, et le compte de ceux qui sont
         * tombés (usage absent ou libre, vignette non adressée par contenu, clé de nom absente, identifiant repris).
         */
        fun parse(text: String): Parsed? {
            val root = runCatching { Json.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return null
            if ((root["schema"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull != SCHEMA) return null
            val candidates = root["frames"] as? JsonArray ?: return null
            val kept = mutableListOf<GloryFramePackFrame>()
            candidates.forEach { candidate ->
                val frame = readFrame(candidate) ?: return@forEach
                if (kept.none { it.id == frame.id }) kept += frame
            }
            return Parsed(GloryFramePackContract(kept), candidates.size - kept.size)
        }

        private fun readFrame(element: JsonElement): GloryFramePackFrame? {
            val obj = element as? JsonObject ?: return null
            val id = obj.string("id")?.takeIf(::isFrameId) ?: return null
            val usage = FrameUsageWire.parseUsage(obj["usage"])?.takeIf(FrameUsageWire::isGloryUsage) ?: return null
            val thumb = FramePackReader.assetRef(obj["thumb"]) ?: return null
            val i18n = obj["i18n"] as? JsonObject ?: return null
            val nameKey = i18n.string("name")?.takeIf(PackStringKey::isValid) ?: return null
            val story = i18n["story"]
            val storyKey = when {
                story == null || story is kotlinx.serialization.json.JsonNull -> null
                else -> i18n.string("story")?.takeIf(PackStringKey::isValid) ?: return null
            }
            return GloryFramePackFrame(id, usage, thumb, nameKey, storyKey, GloryFramePlacementReader.read(id, usage, obj))
        }

        /** `GLORY_FRAME_ID_PATTERN` : des segments en forme de slug séparés par des points. */
        fun isFrameId(id: String): Boolean =
            id.length <= MAX_FRAME_ID_LENGTH && id.split('.').all(PackSlug::isSlugShaped)
    }

    data class Parsed(val contract: GloryFramePackContract, val rejected: Int)
}

/** `PACK_STRING_KEY_PATTERN` et `parsePackStrings` du shared. */
object PackStringKey {
    private const val MAX_KEY = 120
    private const val MAX_STRING = 2_000

    fun isValid(key: String): Boolean {
        val first = key.firstOrNull() ?: return false
        if (key.length > MAX_KEY || !(first in 'a'..'z' || first in '0'..'9')) return false
        return key.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '.' || it == '_' || it == '-' }
    }

    /** Une paire illisible tombe seule ; une forme illisible rend une table vide. */
    fun parseStrings(text: String): Map<String, String> {
        val obj = runCatching { Json.parseToJsonElement(text) }.getOrNull() as? JsonObject ?: return emptyMap()
        return obj.mapNotNull { (key, value) ->
            val string = (value as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (isValid(key) && string != null && string.isNotBlank() && string.length <= MAX_STRING) key to string else null
        }.toMap()
    }
}
