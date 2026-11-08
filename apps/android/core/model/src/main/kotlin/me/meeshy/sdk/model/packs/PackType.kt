package me.meeshy.sdk.model.packs

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * L'origine d'un pack servi (`PackOrigin` du contrat) : `builtin` dessiné par le client, `official` publié par Meeshy,
 * `community` proposé par un tiers (stickers seuls). Un type qu'une passerelle plus récente ajouterait se lit
 * [UNKNOWN] — ancien client, nouveau serveur — jamais en erreur.
 */
@kotlinx.serialization.Serializable(with = PackTypeSerializer::class)
enum class PackType(val wire: String?) {
    BUILTIN("builtin"),
    OFFICIAL("official"),
    COMMUNITY("community"),
    UNKNOWN(null),
    ;

    companion object {
        /** Les types que ce client sait nommer. */
        val served: List<PackType> = entries.filter { it.wire != null }

        fun fromWire(raw: String?): PackType = served.firstOrNull { it.wire == raw?.trim()?.lowercase() } ?: UNKNOWN
    }
}

object PackTypeSerializer : KSerializer<PackType> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("PackType", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): PackType = PackType.fromWire(decoder.decodeString())
    override fun serialize(encoder: Encoder, value: PackType) = encoder.encodeString(value.wire ?: "unknown")
}
