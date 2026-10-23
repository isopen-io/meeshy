package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pourquoi le lecteur ne peut pas écrire dans cette conversation (#9927). Miroir de
 * `ConversationWriteRestriction` (iOS). La passerelle la CALCULE (`viewerWriteRestriction`) ; rien
 * n'est stocké ici. Une valeur inconnue est GARDÉE ([Unknown]), jamais fatale, et seule
 * [MinorGlobal] ferme le composeur : la passerelle refuse le reste, et dit pourquoi.
 */
sealed interface ConversationWriteRestriction {
    val wireValue: String

    /** Global n'admet l'écriture qu'à partir de 18 ans. */
    data object MinorGlobal : ConversationWriteRestriction {
        override val wireValue: String = MINOR_GLOBAL
    }

    /** Une restriction qu'une passerelle plus récente sait nommer. */
    data class Unknown(override val wireValue: String) : ConversationWriteRestriction

    val closesComposer: Boolean get() = this == MinorGlobal
    val imposesArchive: Boolean get() = this == MinorGlobal

    companion object {
        const val MINOR_GLOBAL = "minor-global"
        const val GLOBAL_ADULTS_ONLY_CODE = "GLOBAL_ADULTS_ONLY"

        fun fromWire(value: String): ConversationWriteRestriction =
            if (value == MINOR_GLOBAL) MinorGlobal else Unknown(value)
    }
}

/**
 * Tolérant : `null`, un nombre ou un objet valent « aucune restriction » (`null`), une chaîne vide
 * aussi. Jamais d'exception — la ligne de conversation qui la porte ne tombe pas pour elle.
 */
internal object ConversationWriteRestrictionSerializer : KSerializer<ConversationWriteRestriction?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ConversationWriteRestriction", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): ConversationWriteRestriction? {
        val raw: JsonElement = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return null
        if (raw is JsonNull) return null
        val primitive = raw as? JsonPrimitive ?: return null
        if (!primitive.isString || primitive.content.isEmpty()) return null
        return ConversationWriteRestriction.fromWire(primitive.content)
    }

    override fun serialize(encoder: Encoder, value: ConversationWriteRestriction?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value.wireValue)
    }
}
