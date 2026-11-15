package me.meeshy.sdk.model.comments

/**
 * Où ramener la liste quand une réponse commence (iOS `CommentReplyFocus`, #8644) : le commentaire visé reste au-dessus
 * du composeur, jamais sous le clavier. La règle, sans vue.
 */
object CommentReplyFocus {
    /** Le temps que le clavier monte et que la liste se rétrécisse : défiler avant, c'est viser une rangée qui bougera encore. */
    const val KEYBOARD_SETTLE_MILLIS: Long = 300L

    private const val ANCHOR_PREFIX: String = "comment-"

    /** L'ancre de rangée (`comment-<id>`), pour une racine comme pour une réponse dépliée ; `null` : rien ne défile. */
    fun scrollTarget(replyingToId: String?): String? =
        replyingToId?.takeIf { it.isNotEmpty() }?.let { ANCHOR_PREFIX + it }
}
