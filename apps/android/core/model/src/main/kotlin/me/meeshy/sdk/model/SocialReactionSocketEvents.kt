package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Le compte ABSOLU d'un emoji apres la mutation (miroir d'iOS `SocketPostReactionAggregation`). */
@Serializable
data class SocketPostReactionAggregation(
    val emoji: String = "",
    val count: Int = 0,
)

/**
 * `post:reaction-added` / `post:reaction-removed` : [aggregation] porte le compte absolu, une seule ecriture
 * idempotente couvre donc les deux sens (miroir d'iOS `SocketPostReactionUpdateEvent`).
 */
@Serializable
data class SocketPostReactionUpdateData(
    val postId: String,
    val userId: String = "",
    val emoji: String = "",
    val action: String = "",
    val aggregation: SocketPostReactionAggregation? = null,
    val timestamp: String? = null,
)

/** `comment:media-updated` : le commentaire enrichi (transcription, traductions audio) a substituer (miroir d'iOS). */
@Serializable
data class SocketCommentMediaUpdatedData(
    val postId: String,
    val commentId: String,
    val comment: ApiPostComment,
)

/** Le resume de reactions d'un post apres un `post:reaction-*` : le compte absolu de l'emoji, retire quand il tombe a zero. */
object PostReactionSummaryLaw {
    fun applying(post: ApiPost, emoji: String, count: Int): ApiPost? {
        if (emoji.isBlank()) return null
        val current = post.reactionSummary.orEmpty()
        val next = if (count <= 0) current - emoji else current + (emoji to count)
        return if (next == current) null else post.copy(reactionSummary = next)
    }
}
