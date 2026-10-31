package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * La lecture de `storyEffects` d'un post SERVI (#13863 R7). Elle rend ce que [StoryEffectsWireSerializer] rend — la
 * première scène rabattue sur les familles v1, que tout consommateur plat lit déjà — et, pour un document de DEUX scènes
 * ou plus, garde le document lui-même dans [StoryEffects.canvas] : c'est de lui que le fil peint les scènes 2 à N
 * ([PostSceneReading]). Réencodé (un post recopié ou mis en cache), il réécrit le document servi, jamais sa seule
 * première scène.
 */
object PostReadStoryEffectsSerializer : KSerializer<StoryEffects> {
    override val descriptor: SerialDescriptor = StoryEffectsWireSerializer.descriptor

    private val tolerant = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    override fun deserialize(decoder: Decoder): StoryEffects {
        val input = decoder as? JsonDecoder ?: return StoryEffectsWireSerializer.deserialize(decoder)
        val element = input.decodeJsonElement()
        val flat = input.json.decodeFromJsonElement(StoryEffectsWireSerializer, element)
        return severalScenes(element)?.let { flat.copy(canvas = it) } ?: flat
    }

    override fun serialize(encoder: Encoder, value: StoryEffects) {
        val canvas = value.canvas
        val output = encoder as? JsonEncoder
        if (output != null && canvas != null) output.encodeJsonElement(CanvasV3Migration.encodeDocument(canvas))
        else StoryEffectsWireSerializer.serialize(encoder, value)
    }

    private fun severalScenes(element: JsonElement): CanvasV3? {
        val document = element as? JsonObject ?: return null
        val mark = (document["v"] as? JsonPrimitive)?.intOrNull ?: return null
        if (mark < 3) return null
        return runCatching { tolerant.decodeFromJsonElement(CanvasV3.serializer(), document) }.getOrNull()
            ?.takeIf { it.scenes.size >= 2 }
    }
}
