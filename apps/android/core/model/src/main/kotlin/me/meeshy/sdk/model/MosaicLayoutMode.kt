package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

@Serializable(with = MosaicLayoutModeSerializer::class)
enum class MosaicLayoutMode(val wireName: String) {
    WAVE("wave"),
    HERO("hero"),
    REEL("reel"),
    SINE("sine"),
    CAROUSEL("carousel"),
    ;

    companion object {
        val FALLBACK: MosaicLayoutMode = CAROUSEL
    }
}

object MosaicLayoutModeSerializer : KSerializer<MosaicLayoutMode> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("me.meeshy.sdk.model.MosaicLayoutMode", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): MosaicLayoutMode {
        decoder.decodeString()
        return MosaicLayoutMode.FALLBACK
    }

    override fun serialize(encoder: Encoder, value: MosaicLayoutMode) {
        encoder.encodeString(value.wireName)
    }
}

val StoryEffects?.resolvedLayout: MosaicLayoutMode
    get() = MosaicLayoutMode.FALLBACK
