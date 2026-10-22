package me.meeshy.sdk.model.serialization

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement

/**
 * Décode une liste ÉLÉMENT PAR ÉLÉMENT : un élément qui ne se décode pas est
 * écarté, les autres sont gardés DANS L'ORDRE — le site unique de cette
 * tolérance, miroir de `decodeLossyArrayIfPresent` (iOS).
 *
 * Le fil ne garantit rien de la forme d'un élément. Sans cette tolérance,
 * kotlinx échoue sur le DOCUMENT entier : une pièce jointe écrite à moitié
 * emporte son message, donc la page de fil qui le contient.
 *
 * Deux saveurs, car deux contrats de porteur :
 *  - [LossyListSerializer] pour un `List<T> = emptyList()` : tout ce qui n'est
 *    pas un tableau rend la liste vide ;
 *  - [LossyNullableListSerializer] pour un `List<T>? = null` : clé absente,
 *    `null` ou valeur qui n'est pas un tableau rendent `null` — jamais une
 *    liste vide inventée —, un tableau vide ou entièrement invalide rend `[]`.
 *
 * Un porteur nomme son saveur par un objet (le plugin exige une classe sans
 * paramètre) : `object X : KSerializer<List<T>?> by LossyNullableListSerializer(T.serializer())`.
 */
class LossyListSerializer<T : Any>(
    private val element: KSerializer<T>,
) : KSerializer<List<T>> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): List<T> = decodeLossyList(decoder, element) ?: emptyList()

    override fun serialize(encoder: Encoder, value: List<T>) {
        encoder.encodeSerializableValue(ListSerializer(element), value)
    }
}

/** Saveur `List<T>?` de [LossyListSerializer] : l'absence et le non-tableau restent `null`. */
class LossyNullableListSerializer<T : Any>(
    private val element: KSerializer<T>,
) : KSerializer<List<T>?> {

    /**
     * Le descripteur annonce du JSON ARBITRAIRE (même raison que
     * `StoryTransitionTolerantSerializer`) : le décodeur ne doit pas se
     * positionner pour lire une liste, l'élément est lu d'un bloc.
     */
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): List<T>? = decodeLossyList(decoder, element)

    override fun serialize(encoder: Encoder, value: List<T>?) {
        if (value == null) {
            encoder.encodeNull()
            return
        }
        encoder.encodeSerializableValue(ListSerializer(element), value)
    }
}

private fun <T : Any> decodeLossyList(decoder: Decoder, element: KSerializer<T>): List<T>? {
    val input = decoder as? JsonDecoder
        ?: return decoder.decodeSerializableValue(ListSerializer(element))
    val array = input.decodeJsonElement() as? JsonArray ?: return null
    return array.mapNotNull { item -> decodeOrNull { input.json.decodeFromJsonElement(element, item) } }
}

/**
 * `null` quand [block] échoue parce que son entrée est malformée : kotlinx lève une
 * `SerializationException` (une `IllegalArgumentException`) pour la forme, parfois
 * une `IllegalStateException` pour un accesseur de primitive. Le site unique de ce
 * filtre, partagé par les sérialiseurs tolérants.
 */
internal inline fun <T> decodeOrNull(block: () -> T): T? =
    try {
        block()
    } catch (_: IllegalArgumentException) {
        null
    } catch (_: IllegalStateException) {
        null
    }
