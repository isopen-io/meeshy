package me.meeshy.sdk.model.serialization

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

/**
 * Isole un champ PÉRIPHÉRIQUE de son porteur : s'il est malformé il vaut `null`,
 * il ne fait pas échouer le décodage du document entier.
 *
 * Réservé aux champs que le fil peut légitimement servir à moitié écrits — les blobs
 * du Prisme Linguistique (transcription, traductions) qu'un worker écrit pendant
 * l'enrichissement, les décorations par pièce (réactions, progression) — jamais à
 * un champ qui gouverne une protection : celui-là se décode FERMÉ, pas absent
 * (voir [me.meeshy.sdk.model.ProtectionBooleanSerializer]).
 *
 * Un porteur nomme son saveur par un objet :
 * `object X : KSerializer<T?> by TolerantSerializer(T.serializer())`.
 */
class TolerantSerializer<T : Any>(
    private val element: KSerializer<T>,
) : KSerializer<T?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): T? {
        val input = decoder as? JsonDecoder ?: return decoder.decodeSerializableValue(element)
        val raw = input.decodeJsonElement()
        if (raw is JsonNull) return null
        return decodeOrNull { input.json.decodeFromJsonElement(element, raw) }
    }

    override fun serialize(encoder: Encoder, value: T?) {
        if (value == null) {
            encoder.encodeNull()
            return
        }
        encoder.encodeSerializableValue(element, value)
    }
}
