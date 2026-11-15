package me.meeshy.sdk.model

/**
 * Faut-il PROPOSER le Reel à l'auteur d'un post simple (#8603) — miroir de
 * `ReelComposition.offersReelForPost` (iOS). L'offre n'existe que pour un POST composé
 * d'UNE seule vidéo qualifiante (durée connue >= 3 s), ni repost ni édition, et tant que
 * l'auteur n'a pas lui-même choisi son format.
 */
public object ReelOffer {
    public fun offersReelForPost(
        type: PostType,
        media: List<ReelComposition.MediaKind>,
        isRepost: Boolean,
        isEdit: Boolean,
        formatChosenByAuthor: Boolean,
    ): Boolean {
        if (type != PostType.POST || isRepost || isEdit || formatChosenByAuthor) return false
        val only = media.singleOrNull() ?: return false
        if (!only.mimeType.lowercase().startsWith("video/")) return false
        return ReelComposition.qualifiesAsReel(media)
    }
}
