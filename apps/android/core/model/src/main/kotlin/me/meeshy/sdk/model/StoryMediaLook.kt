package me.meeshy.sdk.model

import java.util.Locale
import kotlin.math.abs
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/**
 * **Le cadrage choisi dans la source** — miroir de `StoryMediaFraming` (iOS, #13840) : le centre en fractions 0…1
 * (repère y vers le HAUT) et l'échelle (1 ⇒ remplissage exact). L'identité (0,5 · 0,5 · 1) ne s'écrit pas.
 */
@Serializable
data class StoryMediaFraming(val centerX: Double, val centerY: Double, val scale: Double) {
    val isIdentity: Boolean
        get() = abs(centerX - CENTER) < EPSILON && abs(centerY - CENTER) < EPSILON && abs(scale - 1.0) < EPSILON

    companion object {
        private const val CENTER = 0.5
        private const val EPSILON = 0.0005
        val IDENTITY: StoryMediaFraming = StoryMediaFraming(CENTER, CENTER, 1.0)
    }
}

/**
 * **Ce que la retouche pose sur un média sans le cuire** (#13841, format v1 d'iOS `StoryMediaLook`, spec § 3.6) : des
 * identifiants OPAQUES — `filterPreset` (`VideoFilterPreset`), `frameId` (`classic:<style>` ou `frame:<id>`),
 * `faceEffect` (`CallFaceEffect`), `framing`. Tous optionnels, absents quand ils ne peignent rien. La lecture est
 * TOLÉRANTE : un champ illisible se lit absent, un identifiant inconnu est gardé (il se peint « aucun »). Le look vit
 * au brouillon et dans l'historique ; il ne part JAMAIS au fil : la publication le cuit dans les octets téléversés.
 */
@Serializable(with = StoryMediaLookSerializer::class)
data class StoryMediaLook(
    val filterPreset: String? = null,
    val frameId: String? = null,
    val faceEffect: String? = null,
    val framing: StoryMediaFraming? = null,
) {
    /** Rien à peindre : la source telle quelle. */
    val isNeutral: Boolean
        get() = filterPreset == null && frameId == null && faceEffect == null && (framing?.isIdentity ?: true)

    /** Le look, ou `null` s'il ne peint rien — la forme qu'un média garde. */
    val normalized: StoryMediaLook? get() = if (isNeutral) null else this

    /** Une clé DÉTERMINISTE pour les caches de rendu (celle d'iOS). */
    val signature: String
        get() {
            val cadrage = framing?.let { String.format(Locale.ROOT, "%.3f,%.3f,%.3f", it.centerX, it.centerY, it.scale) } ?: "-"
            return listOf(filterPreset ?: "-", frameId ?: "-", faceEffect ?: "-", cadrage).joinToString("|")
        }

    internal fun toJson(): JsonObject = buildJsonObject {
        filterPreset?.let { put("filterPreset", it) }
        frameId?.let { put("frameId", it) }
        faceEffect?.let { put("faceEffect", it) }
        framing?.takeUnless { it.isIdentity }?.let { cadrage ->
            put("framing", buildJsonObject {
                put("centerX", cadrage.centerX)
                put("centerY", cadrage.centerY)
                put("scale", cadrage.scale)
            })
        }
    }

    companion object {
        /** Le look lu d'une charge quelconque : ce qui ne se lit pas est absent, jamais un échec. */
        fun read(element: JsonElement?): StoryMediaLook {
            val entries = element as? JsonObject ?: return StoryMediaLook()
            fun text(key: String): String? = (entries[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
            fun number(from: JsonObject, key: String): Double? = (from[key] as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull
            val cadrage = (entries["framing"] as? JsonObject)?.let { c ->
                val x = number(c, "centerX") ?: return@let null
                val y = number(c, "centerY") ?: return@let null
                val s = number(c, "scale") ?: return@let null
                StoryMediaFraming(x, y, s)
            }
            return StoryMediaLook(text("filterPreset"), text("frameId"), text("faceEffect"), cadrage?.takeUnless { it.isIdentity })
        }
    }
}

/** Le look d'un média, lu et écrit par JSON seulement (le brouillon), tolérant à la lecture. */
object StoryMediaLookSerializer : KSerializer<StoryMediaLook> {
    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor

    override fun deserialize(decoder: Decoder): StoryMediaLook {
        val json = decoder as? JsonDecoder ?: throw SerializationException("StoryMediaLook se lit en JSON")
        return StoryMediaLook.read(json.decodeJsonElement())
    }

    override fun serialize(encoder: Encoder, value: StoryMediaLook) {
        val json = encoder as? JsonEncoder ?: throw SerializationException("StoryMediaLook s'écrit en JSON")
        json.encodeJsonElement(value.toJson())
    }
}

/**
 * Les looks des médias d'une diapo, par identifiant de média : une carte illisible se lit vide, une entrée illisible
 * ou neutre disparaît — à la lecture comme à l'écriture.
 */
object StoryMediaLooksSerializer : KSerializer<Map<String, StoryMediaLook>> {
    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor

    override fun deserialize(decoder: Decoder): Map<String, StoryMediaLook> {
        val json = decoder as? JsonDecoder ?: throw SerializationException("les looks se lisent en JSON")
        val entries = json.decodeJsonElement() as? JsonObject ?: return emptyMap()
        return entries.mapNotNull { (id, element) -> StoryMediaLook.read(element).normalized?.let { id to it } }.toMap()
    }

    override fun serialize(encoder: Encoder, value: Map<String, StoryMediaLook>) {
        val json = encoder as? JsonEncoder ?: throw SerializationException("les looks s'écrivent en JSON")
        json.encodeJsonElement(JsonObject(value.mapNotNull { (id, look) -> look.normalized?.let { id to it.toJson() } }.toMap()))
    }
}
