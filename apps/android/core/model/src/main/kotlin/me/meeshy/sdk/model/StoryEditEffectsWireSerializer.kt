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
 * l'écriture ne nomme pas disparaît de la story. Le modèle Android ne sait pas tout dire de ce qu'iOS écrit ; une story
 * modifiée part donc sous la forme du blob SERVI où seul ce que l'auteur a changé est remplacé ([StoryEffects.document]),
 * écrite telle quelle. Un document de scène ([StoryEffects.canvas]) part de même ; le reste garde le fil v1 de
 * `createStory`.
 */
object StoryEditEffectsWireSerializer : KSerializer<StoryEffects> {
    override val descriptor: SerialDescriptor = StoryEffectsWireSerializer.descriptor

    override fun deserialize(decoder: Decoder): StoryEffects = StoryEffectsWireSerializer.deserialize(decoder)

    override fun serialize(encoder: Encoder, value: StoryEffects) {
        val output = encoder as? JsonEncoder
        val document = value.document
        val canvas = value.canvas
        when {
            output != null && document != null && value == StoryEffects(document = document) -> output.encodeJsonElement(document)
            output != null && canvas != null && value == StoryEffects(canvas = canvas) ->
                output.encodeJsonElement(CanvasV3Migration.encodeDocument(canvas))
            else -> StoryEffectsWireSerializer.serialize(encoder, value)
        }
    }
}
