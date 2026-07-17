package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated

/**
 * A comment projected for rendering: author, Prisme-resolved content, reply awareness,
 * and the optimistic-pending flag. Pure data — built by [CommentProjection] so the
 * resolution stays unit-testable and the Compose layer stays dumb.
 */
@Immutable
data class CommentPresentation(
    val id: String,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val likeCount: Int,
    val isLiked: Boolean,
    val replyCount: Int,
    val parentId: String?,
    val isReply: Boolean,
    val isPending: Boolean,
)

object CommentProjection {

    /**
     * Project [comment] for rendering. Content follows the Prisme Linguistique exactly
     * as a feed post does ([ApiPostComment.displayContent]); [isPending] flags an
     * optimistic row awaiting server confirmation.
     */
    fun build(
        comment: ApiPostComment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        isPending: Boolean = false,
        likeState: CommentLikeState = CommentLikeState(),
    ): CommentPresentation = CommentPresentation(
        id = comment.id,
        authorName = (comment.author?.displayName ?: comment.author?.username)
            ?.takeIf { it.isNotBlank() },
        authorAvatarUrl = comment.author?.avatar
            ?.takeIf { it.isNotBlank() }
            ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
        createdAtIso = comment.createdAt,
        content = comment.displayContent(preferences),
        isTranslated = comment.isTranslated(preferences),
        likeCount = likeState.displayCount(comment.id, comment.likeCount ?: 0),
        isLiked = likeState.isLiked(comment.id),
        replyCount = comment.replyCount ?: 0,
        parentId = comment.parentId?.takeIf { it.isNotBlank() },
        isReply = !comment.parentId.isNullOrBlank(),
        isPending = isPending,
    )
}
