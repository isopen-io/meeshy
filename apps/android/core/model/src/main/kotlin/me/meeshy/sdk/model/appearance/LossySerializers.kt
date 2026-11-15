package me.meeshy.sdk.model.appearance

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import me.meeshy.sdk.model.pack.PackAssetRef

/*
 * Le décodage TOLÉRANT du catalogue d'apparence, miroir de `LossyBox` /
 * `LossyDecodableArray` côté iOS : un élément illisible (champ d'une passerelle
 * plus récente, forme hors bornes) tombe SEUL. Il ne coûte jamais la liste qui le
 * porte, ni le pack, ni le catalogue.
 *
 * kotlinx fait échouer le DOCUMENT entier sur un seul champ de travers : c'est
 * précisément ce que ces sérialiseurs empêchent. Ils ne lisent que du JSON.
 */

/** Lire un élément ou renoncer : `null` pour toute forme que le sérialiseur refuse. */
private inline fun <R : Any> readOrNull(block: () -> R): R? =
    try {
        block()
    } catch (_: IllegalArgumentException) {
        // SerializationException en est une sous-classe ; `require` d'un modèle aussi.
        null
    } catch (_: IllegalStateException) {
        null
    }

/**
 * Les éléments lisibles de [element] (un tableau JSON), dans l'ordre ; tout autre
 * JSON, ou `null`, rend une liste vide.
 *
 * @param maxDeclared au-delà, la liste est un abus : elle est refusée en bloc.
 * @param maxKept le nombre d'éléments lisibles conservés, au plus.
 */
fun <T : Any> Json.decodeLossyList(
    element: JsonElement?,
    serializer: KSerializer<T>,
    maxDeclared: Int = Int.MAX_VALUE,
    maxKept: Int = Int.MAX_VALUE,
): List<T> {
    val array = element as? JsonArray ?: return emptyList()
    if (array.size > maxDeclared) return emptyList()
    return array
        .mapNotNull { item -> readOrNull { decodeFromJsonElement(serializer, item) } }
        .take(maxKept)
}

/**
 * Comme [decodeLossyList], mais un élément illisible GARDE SA PLACE (`null`) : les
 * éléments voisins le désignent par leur index (le dégradé d'un contour), et
 * compacter la liste ferait désigner le mauvais.
 */
fun <T : Any> Json.decodeLossySlots(
    element: JsonElement?,
    serializer: KSerializer<T>,
    maxKept: Int = Int.MAX_VALUE,
): List<T?> {
    val array = element as? JsonArray ?: return emptyList()
    return array.map { item -> readOrNull { decodeFromJsonElement(serializer, item) } }.take(maxKept)
}

/**
 * Une liste dont chaque élément se lit SEUL. À poser par
 * `@Serializable(with = …)` sur la propriété — ou à déléguer depuis un `object`
 * (`object X : KSerializer<List<T>> by LossyListSerializer(T.serializer())`).
 */
open class LossyListSerializer<T : Any>(
    private val element: KSerializer<T>,
    private val maxDeclared: Int = Int.MAX_VALUE,
    private val maxKept: Int = Int.MAX_VALUE,
) : KSerializer<List<T>> {

    /** Du JSON arbitraire, comme `StoryTransitionTolerantSerializer` : un descripteur de liste désynchroniserait le décodeur. */
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): List<T> {
        val input = decoder as? JsonDecoder ?: throw SerializationException("lecture JSON uniquement")
        return input.json.decodeLossyList(input.decodeJsonElement(), element, maxDeclared, maxKept)
    }

    override fun serialize(encoder: Encoder, value: List<T>) {
        encoder.encodeSerializableValue(ListSerializer(element), value)
    }
}

/** La liste dont un élément illisible GARDE SA PLACE : voir [decodeLossySlots]. */
open class LossySlotListSerializer<T : Any>(
    private val element: KSerializer<T>,
    private val maxKept: Int = Int.MAX_VALUE,
) : KSerializer<List<T?>> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): List<T?> {
        val input = decoder as? JsonDecoder ?: throw SerializationException("lecture JSON uniquement")
        return input.json.decodeLossySlots(input.decodeJsonElement(), element, maxKept)
    }

    override fun serialize(encoder: Encoder, value: List<T?>) {
        encoder.encodeSerializableValue(ListSerializer(element), value.filterNotNull())
    }
}

/** Un champ facultatif illisible se lit `null` : le dessin reste la vérité, le champ n'est qu'un plus. */
open class LossyNullableSerializer<T : Any>(
    private val element: KSerializer<T>,
) : KSerializer<T?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): T? {
        val input = decoder as? JsonDecoder ?: throw SerializationException("lecture JSON uniquement")
        val raw = input.decodeJsonElement()
        if (raw is JsonNull) return null
        return readOrNull { input.json.decodeFromJsonElement(element, raw) }
    }

    override fun serialize(encoder: Encoder, value: T?) {
        if (value == null) encoder.encodeNull() else encoder.encodeSerializableValue(element, value)
    }
}

/** La couche animée facultative d'un dessin : illisible ⇒ ignorée. */
object LossyPackAssetRefSerializer : KSerializer<PackAssetRef?> by LossyNullableSerializer(PackAssetRef.serializer())
