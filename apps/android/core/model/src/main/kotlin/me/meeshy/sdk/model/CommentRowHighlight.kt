package me.meeshy.sdk.model

/** Surlignage fugitif de la cible d'une notification et ancre `comment-<id>` pour le défilement. */
public object CommentRowHighlight {
    public const val DURATION_MILLIS: Long = 2_500L
    private const val PREFIX: String = "comment-"

    public fun anchor(commentId: String): String = PREFIX + commentId

    public fun commentIdOf(anchor: String): String? =
        anchor.takeIf { it.startsWith(PREFIX) }?.removePrefix(PREFIX)?.takeIf { it.isNotBlank() }

    public fun isHighlighted(commentId: String, targetId: String?): Boolean = targetId != null && commentId == targetId
}
