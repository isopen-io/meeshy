package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

private val tolerantJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    explicitNulls = false
    coerceInputValues = true
}

/**
 * Une charge illisible rend `null` plutôt que de faire échouer le décodage du post
 * entier (le lot de stories se décode en tableau strict) — même résilience que iOS pour
 * `mentions`, `trackingLinks` et `metadata`.
 */
internal abstract class TolerantSerializer<T : Any>(
    private val inner: KSerializer<T>,
) : KSerializer<T?> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): T? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return null
        if (element is JsonNull) return null
        return try {
            tolerantJson.decodeFromJsonElement(inner, element)
        } catch (_: Exception) {
            null
        }
    }

    override fun serialize(encoder: Encoder, value: T?) {
        val json = encoder as? kotlinx.serialization.json.JsonEncoder
        if (value == null) {
            json?.encodeJsonElement(JsonNull) ?: encoder.encodeNull()
            return
        }
        json?.encodeJsonElement(tolerantJson.encodeToJsonElement(inner, value))
    }
}

internal object TolerantPostReferencesSerializer :
    TolerantSerializer<List<PostReference>>(ListSerializer(PostReference.serializer()))

internal object TolerantTrackedLinksSerializer :
    TolerantSerializer<List<TrackedLink>>(ListSerializer(TrackedLink.serializer()))

internal object TolerantTrackingMetadataSerializer :
    TolerantSerializer<TrackingLinksMetadata>(TrackingLinksMetadata.serializer())

/** Un compteur négatif ou mal formé n'est pas servi : « garde ce que tu sais », jamais zéro. */
internal object NonNegativeIntSerializer : KSerializer<Int?> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): Int? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return null
        val value = (element as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
        return value?.takeIf { it >= 0 }
    }

    override fun serialize(encoder: Encoder, value: Int?) {
        if (value == null) encoder.encodeNull() else encoder.encodeInt(value)
    }
}

/** Le `metadata` d'un contenu social réduit à ce que le client en lit : les liens suivis. */
@Serializable
public data class TrackingLinksMetadata(
    @Serializable(with = TolerantTrackedLinksSerializer::class)
    val trackingLinks: List<TrackedLink>? = null,
)
