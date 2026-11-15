package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * LE MÉDIA DU POST QU'UN COMMENTAIRE CITE (#6578) — côté lecture, miroir de
 * `CommentQuotedMedia` (CommentQuotedMedia.swift).
 *
 * Le serveur ne grave que l'ancre ([postMediaId]) et la NATURE ([kind]) ; ce qui DÉCRIT
 * le média est relu à chaque service dans [media]. `media == null` n'est PAS une erreur :
 * c'est l'état nominal d'une citation dont la cible n'existe plus (« une photo », rien de plus).
 */
public data class CommentQuotedMedia(
    val postMediaId: String,
    val kind: Kind,
    val media: ApiPostMedia? = null,
) {
    public enum class Kind(public val wire: String) {
        IMAGE("image"),
        VIDEO("video"),
        AUDIO("audio"),
        LOCATION("location"),
        FILE("file"),
        ;

        public companion object {
            /** Une nature inconnue vaut « une pièce jointe » — vrai, et sans effet sur le décodage. */
            public fun fromWire(raw: String?): Kind = entries.firstOrNull { it.wire == raw } ?: FILE
        }
    }

    /** La vignette relue, sinon l'URL du média, sinon rien. Une seule règle, un seul site. */
    val thumbnailUrl: String? get() = media?.let { it.thumbnailUrl ?: it.fileUrl }
}

/** L'ancre figée hissée depuis `metadata.quotedPostMedia` ; la nature reste une chaîne (tolérance). */
@Serializable
public data class ApiQuotedPostMediaRef(
    val postMediaId: String,
    val kind: String = "",
)

internal object TolerantQuotedRefSerializer :
    TolerantSerializer<ApiQuotedPostMediaRef>(ApiQuotedPostMediaRef.serializer())

/**
 * Recolle les deux moitiés (ancre figée + média relu) — site UNIQUE. `null` : ce commentaire
 * parle du POST, pas d'un média en particulier.
 */
public val ApiPostComment.quotedCitation: CommentQuotedMedia?
    get() {
        val anchor = quotedPostMedia ?: return null
        return CommentQuotedMedia(
            postMediaId = anchor.postMediaId,
            kind = CommentQuotedMedia.Kind.fromWire(anchor.kind),
            media = quotedMedia,
        )
    }
