package me.meeshy.sdk.model.sticker

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * L'identité d'une décoration, indépendamment de ce qui la dessine — miroir de `StickerUsageEntry`
 * d'iOS. Un favori n'est pas une copie de ce qu'on aime, c'est un renvoi vers lui : on retient un
 * identifiant, le catalogue reste la source du dessin. Le JSON (`{"kind":"emoji","value":"😀"}`) est
 * celui d'iOS.
 */
@Serializable
data class StickerUsageEntry(val kind: Kind, val value: String) {

    @Serializable
    enum class Kind {
        @SerialName("emoji") EMOJI,
        @SerialName("template") TEMPLATE,
        @SerialName("library") LIBRARY,
        @SerialName("mee") MEE,
    }

    /** L'identité composée, stable (`emoji:😀`). */
    val id: String get() = "${kind.name.lowercase()}:$value"

    companion object {
        fun emoji(glyph: String) = StickerUsageEntry(Kind.EMOJI, glyph)
        fun template(id: String) = StickerUsageEntry(Kind.TEMPLATE, id)
        fun library(id: String) = StickerUsageEntry(Kind.LIBRARY, id)
        fun mee(id: String) = StickerUsageEntry(Kind.MEE, id)
    }
}
