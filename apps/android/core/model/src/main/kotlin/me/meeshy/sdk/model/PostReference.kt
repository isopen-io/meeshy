package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Comment une référence se montre dans un contenu — miroir de l'enum Prisma
 * `PostMentionDisplay` (PostReference.swift). INLINE est dérivé par le serveur ; les
 * trois autres sont déclarés.
 */
@Serializable(with = PostReferenceDisplaySerializer::class)
public enum class PostReferenceDisplay(public val wire: String) {
    INLINE("INLINE"),
    PINNED("PINNED"),
    NOTE("NOTE"),
    SILENT("SILENT"),
    ;

    /** SILENT n'est rendu que pour la personne concernée et l'auteur, jamais en « Avec … ». */
    public val isPubliclyVisible: Boolean get() = this != SILENT

    public companion object {
        /** Un mode inconnu se lit INLINE : il ne doit pas rendre le post illisible. */
        public fun fromWire(raw: String?): PostReferenceDisplay =
            entries.firstOrNull { it.wire == raw } ?: INLINE
    }
}

public object PostReferenceDisplaySerializer : KSerializer<PostReferenceDisplay> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("PostReferenceDisplay", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): PostReferenceDisplay =
        PostReferenceDisplay.fromWire(decoder.decodeString())

    override fun serialize(encoder: Encoder, value: PostReferenceDisplay) {
        encoder.encodeString(value.wire)
    }
}

/** Une personne référencée dans un contenu, profil résolu au chargement (PostReference.swift). */
@Serializable
public data class PostReference(
    val userId: String,
    val username: String,
    val displayName: String? = null,
    val avatar: String? = null,
    val display: PostReferenceDisplay = PostReferenceDisplay.INLINE,
) {
    /** Son nom d'affichage s'il existe, son pseudo sinon. */
    val label: String get() = displayName ?: username
}

/**
 * Le droit d'ouvrir un contenu parce qu'on y est référencé — DÉCLARÉ par le serveur.
 * Un verdict inconnu se lit [NONE] : il ne doit rien OUVRIR.
 */
@Serializable(with = ReferenceAccessSerializer::class)
public enum class ReferenceAccess(public val wire: String) {
    NONE("none"),
    GRANTED("granted"),
    CONSUMED("consumed"),
    ;

    public companion object {
        public fun fromWire(raw: String?): ReferenceAccess =
            entries.firstOrNull { it.wire == raw } ?: NONE
    }
}

public object ReferenceAccessSerializer : KSerializer<ReferenceAccess> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ReferenceAccess", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): ReferenceAccess =
        ReferenceAccess.fromWire(decoder.decodeString())

    override fun serialize(encoder: Encoder, value: ReferenceAccess) {
        encoder.encodeString(value.wire)
    }
}
