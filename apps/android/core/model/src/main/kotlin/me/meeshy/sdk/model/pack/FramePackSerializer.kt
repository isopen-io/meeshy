package me.meeshy.sdk.model.pack

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement

/** Lit un pack de cadres par sa lecture tolérante [FramePack.parse] ; seul un slug absent le fait tomber. Jamais écrit. */
object FramePackSerializer : KSerializer<FramePack> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("me.meeshy.FramePack")

    override fun deserialize(decoder: Decoder): FramePack {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement()
            ?: throw SerializationException("un pack de cadres ne se lit qu'en JSON")
        return FramePack.parse(element as JsonElement) ?: throw SerializationException("pack de cadres illisible")
    }

    override fun serialize(encoder: Encoder, value: FramePack) {
        throw SerializationException("un pack de cadres ne s'écrit pas")
    }
}
