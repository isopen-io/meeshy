package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonEncoder

/**
 * L'écriture de `storyEffects` quand une story PUBLIÉE est modifiée (`PUT /posts/:id`, #13632).
 *
 * La route REMPLACE le blob entier (`updatePost` écrit `storyEffects` tel quel, le schéma est `passthrough`) : tout ce que
 * l'écriture ne nomme pas disparaît de la story. Une story écrite par iOS peut porter des objets de scène v3 qu'Android ne
 * sait pas peindre (pastilles de mention, genres plus récents) ou une disposition (`layout`) que seul un document v3
 * déclare ; le fil v1 n'a aucune place pour eux. Quand la modification doit les garder, la charge est donc un document v3
 * ([StoryEffects.canvas], composé par `StoryEditEffects`) et part tel quel ; sinon elle garde le fil v1 d'avant, le seul
 * que `createStory` écrit déjà.
 */
object StoryEditEffectsWireSerializer : KSerializer<StoryEffects> {
    override val descriptor: SerialDescriptor = StoryEffectsWireSerializer.descriptor

    override fun deserialize(decoder: Decoder): StoryEffects = StoryEffectsWireSerializer.deserialize(decoder)

    override fun serialize(encoder: Encoder, value: StoryEffects) {
        val output = encoder as? JsonEncoder
        val canvas = value.canvas
        if (output != null && canvas != null && value == StoryEffects(canvas = canvas)) {
            output.encodeJsonElement(CanvasV3Migration.encodeDocument(canvas))
        } else {
            StoryEffectsWireSerializer.serialize(encoder, value)
        }
    }
}
