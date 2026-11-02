package me.meeshy.sdk.model.preview

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

/**
 * Une clé qui se distingue ABSENTE (« cet événement n'en parle pas ») et NULLE (« il n'y en a
 * plus ») — miroir de `PreviewFieldUpdate` (iOS), pour les champs de la ligne que
 * `conversation:updated` peut vider. C'est la PRÉSENCE de la clé qui porte le signal : un défaut
 * [Unchanged] couvre l'absence, le sérialiseur ne tourne que sur une clé présente.
 */
sealed interface PreviewFieldUpdate<out T : Any> {
    data object Unchanged : PreviewFieldUpdate<Nothing>
    data class Replaced<T : Any>(val value: T?) : PreviewFieldUpdate<T>

    /** La valeur portée, `null` quand la clé était absente OU nulle. */
    val valueOrNull: T?
        get() = (this as? Replaced<T>)?.value
}

/** Une clé présente mais illisible vaut `Replaced(null)`, comme `try?` côté iOS. */
class PreviewFieldUpdateSerializer<T : Any>(
    private val element: KSerializer<T>,
) : KSerializer<PreviewFieldUpdate<T>> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): PreviewFieldUpdate<T> {
        val input = decoder as? JsonDecoder ?: return PreviewFieldUpdate.Replaced(decoder.decodeSerializableValue(element))
        val raw = input.decodeJsonElement()
        if (raw is JsonNull) return PreviewFieldUpdate.Replaced(null)
        val value = try {
            input.json.decodeFromJsonElement(element, raw)
        } catch (_: Exception) {
            null
        }
        return PreviewFieldUpdate.Replaced(value)
    }

    override fun serialize(encoder: Encoder, value: PreviewFieldUpdate<T>) {
        when (value) {
            is PreviewFieldUpdate.Unchanged -> Unit
            is PreviewFieldUpdate.Replaced -> value.value?.let { encoder.encodeSerializableValue(element, it) } ?: encoder.encodeNull()
        }
    }
}
