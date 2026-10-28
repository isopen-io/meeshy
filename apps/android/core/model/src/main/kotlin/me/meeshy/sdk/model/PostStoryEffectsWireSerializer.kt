package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder

/**
 * L'écriture de `storyEffects` d'un POST (#13575). iOS publie toujours un document de scène v3 (`CanvasV3(migrating:)`) ;
 * la passerelle en mode strict (`CANVAS_V3_WRITE_STRICT`) refuse même un blob v1, et la carte de fil iOS ne peint une scène
 * que depuis le v3. La passerelle sert ce v3 tel quel aux clients qui annoncent `X-Canvas-Caps: 3` et rend aux autres la
 * sentinelle de la table O17 : l'ancien client lit donc toujours le post, sans que le client écrive deux formes.
 *
 * Seul l'ensemble « un fond et rien d'autre » part en v3 : c'est ce que le composeur de post sait composer, et la traversée
 * v1 → v3 d'une autre charge (rendue puis réécrite par l'outbox) n'a pas à perdre quoi que ce soit en route. Tout le reste
 * garde le fil v1 d'avant. La LECTURE est celle de [StoryEffectsWireSerializer] : v3 rabattu sur les familles v1.
 */
object PostStoryEffectsWireSerializer : KSerializer<StoryEffects> {
    override val descriptor: SerialDescriptor = StoryEffectsWireSerializer.descriptor

    override fun deserialize(decoder: Decoder): StoryEffects = StoryEffectsWireSerializer.deserialize(decoder)

    override fun serialize(encoder: Encoder, value: StoryEffects) {
        val output = encoder as? JsonEncoder
        if (output != null && isBackgroundOnly(value)) {
            output.encodeJsonElement(CanvasV3Migration.wireDocument(value) as JsonElement)
        } else {
            StoryEffectsWireSerializer.serialize(encoder, value)
        }
    }

    /**
     * « Un fond et rien d'autre ». Jamais une disposition (`layout`) : iOS peint TOUT document v3 à la place des médias du
     * post, et n'écrit `layout` que dans un document de deux scènes ou plus — un `{v:3, layout}` sans scène masquerait les
     * photos d'un post ordinaire à tous ses lecteurs iOS.
     */
    private fun isBackgroundOnly(value: StoryEffects): Boolean =
        value.background != null && value == StoryEffects(background = value.background)
}
