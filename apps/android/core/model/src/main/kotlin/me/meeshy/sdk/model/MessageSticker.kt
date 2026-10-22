package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Le mouvement d'une décoration de sticker — miroir de `StickerAnimation` (iOS). */
enum class StickerAnimation(val wireName: String) {
    PULSE("pulse"),
    HEARTBEAT("heartbeat"),
    WOBBLE("wobble"),
    BOUNCE("bounce"),
    FLOAT("float"),
    SPIN("spin"),
    BLINK("blink"),
    SHAKE("shake"),
    SWING("swing"),
    POP("pop"),
    TADA("tada"),
    ;

    companion object {
        /** Un nom inconnu (publié par une version plus récente) vaut `null` : le sticker reste, immobile. */
        fun fromWire(name: String?): StickerAnimation? = entries.firstOrNull { it.wireName == name }
    }
}

/**
 * Ce qu'un sticker de CONVERSATION est — miroir de `MessageSticker` (iOS, #4823).
 *
 * Soit un gabarit du catalogue ([templateId], [slots] figés, [animation]), soit un
 * emoji, soit un sticker de bibliothèque ([stickerId], l'image jointe le rend). Le
 * décodage est TOLÉRANT : chaque clé est facultative, `slots` absent vaut vide, une
 * animation inconnue vaut `null`. Un sticker qui ne mérite pas de voyager vaut
 * ABSENT — voir [ifWireWorthy].
 */
@Serializable(with = MessageStickerSerializer::class)
data class MessageSticker(
    val templateId: String? = null,
    val slots: Map<String, String> = emptyMap(),
    val animation: StickerAnimation? = null,
    val emoji: String? = null,
    val stickerId: String? = null,
) {
    /** Ce qu'un rendu peut peindre : un `templateId` OU un `emoji` non vides. */
    val isRenderable: Boolean
        get() = !templateId.isNullOrEmpty() || !emoji.isNullOrEmpty()

    /** Ce qui mérite de VOYAGER : un sticker rendable, ou l'identifiant d'un sticker de bibliothèque. */
    val ifWireWorthy: MessageSticker?
        get() = if (isRenderable || !stickerId.isNullOrEmpty()) this else null

    val ifRenderable: MessageSticker?
        get() = if (isRenderable) this else null

    companion object {
        /** Lecture tolérante d'un élément JSON : tout ce qui n'est pas un objet vaut `null`. */
        fun fromJson(element: JsonElement?): MessageSticker? {
            val obj = element as? JsonObject ?: return null
            val slots = (obj["slots"] as? JsonObject)
                ?.mapNotNull { (key, value) -> (value as? JsonPrimitive)?.contentOrNull?.let { key to it } }
                ?.toMap()
                .orEmpty()
            return MessageSticker(
                templateId = obj.text("templateId"),
                slots = slots,
                animation = StickerAnimation.fromWire(obj.text("animation")),
                emoji = obj.text("emoji"),
                stickerId = obj.text("stickerId"),
            )
        }

        private fun JsonObject.text(key: String): String? =
            (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
    }
}

/** Encodage minimal : les `null` et `slots` vide sont omis, comme le schéma de la passerelle. */
object MessageStickerSerializer : KSerializer<MessageSticker> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): MessageSticker {
        val input = decoder as? JsonDecoder ?: throw SerializationException("MessageSticker is JSON only")
        return MessageSticker.fromJson(input.decodeJsonElement())
            ?: throw SerializationException("sticker is not an object")
    }

    override fun serialize(encoder: Encoder, value: MessageSticker) {
        val output = encoder as? JsonEncoder ?: throw SerializationException("MessageSticker is JSON only")
        output.encodeJsonElement(
            buildJsonObject {
                value.templateId?.let { put("templateId", it) }
                if (value.slots.isNotEmpty()) {
                    put("slots", JsonObject(value.slots.mapValues { JsonPrimitive(it.value) }))
                }
                value.animation?.let { put("animation", it.wireName) }
                value.emoji?.let { put("emoji", it) }
                value.stickerId?.let { put("stickerId", it) }
            },
        )
    }
}

/**
 * Champ `sticker` d'un message : tolérant (forme inattendue ⇒ absent) ET « wire-worthy »
 * (un sticker vide sur le fil vaut absence).
 */
object WireWorthyStickerSerializer : KSerializer<MessageSticker?> {

    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): MessageSticker? {
        val input = decoder as? JsonDecoder ?: return null
        return MessageSticker.fromJson(input.decodeJsonElement())?.ifWireWorthy
    }

    override fun serialize(encoder: Encoder, value: MessageSticker?) {
        if (value == null) {
            encoder.encodeNull()
            return
        }
        encoder.encodeSerializableValue(MessageStickerSerializer, value)
    }
}
