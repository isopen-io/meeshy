package me.meeshy.sdk.model.navigation

import java.net.URLEncoder

/**
 * Où le détail d'un post atterrit (iOS `Route.postDetail(_, showComments:, commentId:, parentCommentId:)`) : la
 * notification d'un commentaire ouvre les commentaires, celle d'une réponse vise le commentaire parent ET la réponse.
 * Tout est facultatif : une ancienne route sans argument ouvre le post, comme avant.
 */
public data class PostDetailLanding(
    val showComments: Boolean = false,
    val commentId: String? = null,
    val parentCommentId: String? = null,
) {
    /** Un commentaire visé implique les commentaires, même si la route ne le disait pas. */
    val opensComments: Boolean get() = showComments || commentId != null || parentCommentId != null

    public companion object {
        public const val POST_ID_ARG: String = "postId"
        public const val SHOW_COMMENTS_ARG: String = "showComments"
        public const val COMMENT_ID_ARG: String = "commentId"
        public const val PARENT_COMMENT_ID_ARG: String = "parentCommentId"

        /** Les arguments de route tels que la navigation les rend (chaînes) ; un identifiant vide vaut absent. */
        public fun from(showComments: String?, commentId: String?, parentCommentId: String?): PostDetailLanding =
            PostDetailLanding(
                showComments = showComments.equals("true", ignoreCase = true),
                commentId = commentId?.takeIf { it.isNotBlank() },
                parentCommentId = parentCommentId?.takeIf { it.isNotBlank() },
            )

        public fun route(
            postId: String,
            showComments: Boolean = false,
            commentId: String? = null,
            parentCommentId: String? = null,
        ): String {
            val query = listOfNotNull(
                if (showComments) "$SHOW_COMMENTS_ARG=true" else null,
                commentId?.takeIf { it.isNotBlank() }?.let { "$COMMENT_ID_ARG=${encode(it)}" },
                parentCommentId?.takeIf { it.isNotBlank() }?.let { "$PARENT_COMMENT_ID_ARG=${encode(it)}" },
            )
            val base = "feed/post/$postId"
            return if (query.isEmpty()) base else "$base?${query.joinToString("&")}"
        }

        private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}
