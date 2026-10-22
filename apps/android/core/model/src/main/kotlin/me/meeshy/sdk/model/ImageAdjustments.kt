package me.meeshy.sdk.model

import kotlin.math.abs
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/** Les deux sous-outils d'un média : corrections de ton ([TONE]) et looks posés ([EFFECT]). */
enum class AdjustmentFamily { TONE, EFFECT }

/**
 * Un réglage non destructif d'image — miroir de `AdjustmentKind` (iOS). Le [wireName] est la clé
 * du fil ; [range] borne le curseur ; [neutral] est la valeur sans effet.
 */
enum class AdjustmentKind(
    val wireName: String,
    val range: ClosedFloatingPointRange<Float>,
    val neutral: Float,
    val family: AdjustmentFamily,
) {
    EXPOSURE("exposure", -2f..2f, 0f, AdjustmentFamily.TONE),
    BRIGHTNESS("brightness", -0.4f..0.4f, 0f, AdjustmentFamily.TONE),
    CONTRAST("contrast", 0.5f..1.5f, 1f, AdjustmentFamily.TONE),
    SATURATION("saturation", 0f..2f, 1f, AdjustmentFamily.TONE),
    VIBRANCE("vibrance", -1f..1f, 0f, AdjustmentFamily.TONE),
    TEMPERATURE("temperature", -1f..1f, 0f, AdjustmentFamily.TONE),
    SHARPNESS("sharpness", 0f..1f, 0f, AdjustmentFamily.TONE),
    BLUR("blur", 0f..1f, 0f, AdjustmentFamily.TONE),
    VIGNETTE("vignette", 0f..2f, 0f, AdjustmentFamily.TONE),
    BLOOM("bloom", 0f..1f, 0f, AdjustmentFamily.EFFECT),
    GRAIN("grain", 0f..1f, 0f, AdjustmentFamily.EFFECT),
    ;

    /** Une vidéo ne paie ni netteté, ni flou, ni effet (`isServedForVideo`, iOS #9169 / #9498). */
    val isServedForVideo: Boolean
        get() = this != SHARPNESS && this != BLUR && this != BLOOM && this != GRAIN

    companion object {
        private const val EPSILON = 0.0001f

        internal fun isActive(kind: AdjustmentKind, value: Float): Boolean = abs(value - kind.neutral) > EPSILON
    }
}

/**
 * Le sac des réglages d'un média — miroir d'`ImageAdjustments` (iOS). Tous les défauts sont
 * neutres : une valeur neuve ne change rien ([isNeutral]).
 *
 * Fil : seules les valeurs ACTIVES s'écrivent, l'absence restaure le neutre ; la lecture est
 * tolérante (clé illisible = neutre) et BORNÉE (une valeur hors curseur est ramenée à ses bornes).
 */
@Serializable(with = ImageAdjustmentsSerializer::class)
class ImageAdjustments internal constructor(private val values: Map<AdjustmentKind, Float>) {
    constructor() : this(emptyMap())

    operator fun get(kind: AdjustmentKind): Float = values[kind] ?: kind.neutral

    fun isActive(kind: AdjustmentKind): Boolean = AdjustmentKind.isActive(kind, get(kind))

    val activeCount: Int get() = AdjustmentKind.entries.count(::isActive)

    val isNeutral: Boolean get() = activeCount == 0

    fun with(kind: AdjustmentKind, value: Float): ImageAdjustments =
        ImageAdjustments(normalized(values + (kind to value.coerceIn(kind.range))))

    /** Ces réglages tels qu'un média de ce genre les PEINT : un réglage non servi revient au neutre. */
    fun served(isVideo: Boolean): ImageAdjustments =
        if (!isVideo) this else ImageAdjustments(normalized(values.filterKeys { it.isServedForVideo }))

    /** Les valeurs actives, par clé du fil. */
    val activeValues: Map<String, Float>
        get() = AdjustmentKind.entries.filter(::isActive).associate { it.wireName to get(it) }

    override fun equals(other: Any?): Boolean =
        other is ImageAdjustments && AdjustmentKind.entries.all { get(it) == other.get(it) }

    override fun toString(): String = "ImageAdjustments(${activeValues})"

    override fun hashCode(): Int = AdjustmentKind.entries.fold(0) { acc, k -> 31 * acc + get(k).hashCode() }

    companion object {
        val NEUTRAL: ImageAdjustments = ImageAdjustments()

        private fun normalized(values: Map<AdjustmentKind, Float>): Map<AdjustmentKind, Float> =
            values.filter { (kind, value) -> AdjustmentKind.isActive(kind, value) }

        /** Reconstruit depuis une forme `activeValues` : clés inconnues ignorées, valeurs bornées. */
        fun fromWire(raw: Map<String, Double>): ImageAdjustments = ImageAdjustments(
            normalized(
                AdjustmentKind.entries.mapNotNull { kind ->
                    raw[kind.wireName]?.takeIf { it.isFinite() }
                        ?.let { kind to it.toFloat().coerceIn(kind.range) }
                }.toMap(),
            ),
        )

        fun fromJson(element: JsonElement?): ImageAdjustments? {
            val entries = (element as? JsonObject) ?: return null
            val numbers = entries.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.doubleOrNull?.let { k to it } }.toMap()
            return fromWire(numbers).takeUnless { it.isNeutral }
        }
    }

    internal fun toJson(): JsonObject = JsonObject(activeValues.mapValues { JsonPrimitive(it.value.toString().toDouble()) })
}

object ImageAdjustmentsSerializer : KSerializer<ImageAdjustments> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): ImageAdjustments {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return ImageAdjustments.NEUTRAL
        return ImageAdjustments.fromJson(element) ?: ImageAdjustments.NEUTRAL
    }

    override fun serialize(encoder: Encoder, value: ImageAdjustments) {
        val out = encoder as? JsonEncoder ?: return
        out.encodeJsonElement(value.toJson())
    }
}
