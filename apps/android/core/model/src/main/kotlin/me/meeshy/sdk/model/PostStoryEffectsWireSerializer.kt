package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * L'écriture de `storyEffects` d'un POST (#13575). iOS publie toujours un document de scène v3 (`CanvasV3(migrating:)`) ;
 * la passerelle en mode strict (`CANVAS_V3_WRITE_STRICT`) refuse même un blob v1, et la carte de fil iOS ne peint une scène
 * que depuis le v3. La passerelle sert ce v3 tel quel aux clients qui annoncent `X-Canvas-Caps: 3` et rend aux autres la
 * sentinelle de la table O17 : l'ancien client lit donc toujours le post, sans que le client écrive deux formes.
 *
 * Deux ensembles partent en v3 : « un fond et rien d'autre », et le document de scènes d'un post de photos
 * ([StoryEffects.canvas], #13612 — une scène par photo, `layout` dedans seulement là). Jamais une disposition SEULE : iOS
 * peint TOUT document v3 à la place des médias du post, donc un `{v:3, layout}` sans scène masquerait les photos. Tout le
 * reste garde le fil v1 d'avant. La LECTURE est celle de [StoryEffectsWireSerializer] (v3 rabattu sur les familles v1),
 * plus, quand il porte au moins deux scènes, le document lui-même ([StoryEffects.canvas]) : l'outbox rejoue la charge
 * qu'elle a écrite, et la réécrire à l'identique est ce qui garde chaque scène de la 2 à la N.
 */
object PostStoryEffectsWireSerializer : KSerializer<StoryEffects> {
    override val descriptor: SerialDescriptor = StoryEffectsWireSerializer.descriptor

    private val tolerant = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    override fun deserialize(decoder: Decoder): StoryEffects {
        val input = decoder as? JsonDecoder ?: return StoryEffectsWireSerializer.deserialize(decoder)
        val element = input.decodeJsonElement()
        scenesDocument(element)?.let { return StoryEffects(canvas = it) }
        return input.json.decodeFromJsonElement(StoryEffectsWireSerializer, element)
    }

    override fun serialize(encoder: Encoder, value: StoryEffects) {
        val output = encoder as? JsonEncoder
        val canvas = value.canvas
        when {
            output != null && canvas != null && value == StoryEffects(canvas = canvas) ->
                output.encodeJsonElement(CanvasV3Migration.encodeDocument(canvas))
            output != null && isBackgroundOnly(value) ->
                output.encodeJsonElement(CanvasV3Migration.wireDocument(value) as JsonElement)
            else -> StoryEffectsWireSerializer.serialize(encoder, value)
        }
    }

    private fun scenesDocument(element: JsonElement): CanvasV3? {
        val document = element as? JsonObject ?: return null
        val mark = (document["v"] as? JsonPrimitive)?.intOrNull ?: return null
        if (mark < 3 || ((document["scenes"] as? JsonArray)?.size ?: 0) < 2) return null
        return runCatching { tolerant.decodeFromJsonElement(CanvasV3.serializer(), document) }.getOrNull()
    }

    /**
     * « Un fond et rien d'autre ». Jamais une disposition (`layout`) : iOS peint TOUT document v3 à la place des médias du
     * post, et n'écrit `layout` que dans un document de deux scènes ou plus — un `{v:3, layout}` sans scène masquerait les
     * photos d'un post ordinaire à tous ses lecteurs iOS.
     */
    private fun isBackgroundOnly(value: StoryEffects): Boolean =
        value.background != null && value == StoryEffects(background = value.background)
}
