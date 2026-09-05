package me.meeshy.app.reels

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.displayContent

/** Where a reel comment sits in its optimistic-post lifecycle. */
enum class ReelCommentStatus { Sent, Pending, Failed }

/**
 * A single row in the reels comments sheet — a Prisme-resolved projection of
 * [ApiPostComment] kept optimistic-post-lifecycle aware ([status], [clientId]) so a
 * pending/failed comment can be reconciled or retried without mutating the SDK model.
 */
data class ReelCommentPresentation(
    val id: String,
    val clientId: String? = null,
    val authorName: String,
    val content: String,
    val createdAt: String?,
    val status: ReelCommentStatus = ReelCommentStatus.Sent,
)

/** Maps a server comment through the Prisme (§ CLAUDE.md `resolveUserLanguage`) into its row. */
fun ApiPostComment.toReelComment(prefs: LanguageResolver.ContentLanguagePreferences): ReelCommentPresentation =
    ReelCommentPresentation(
        id = id,
        authorName = (author?.displayName ?: author?.username)?.takeIf { it.isNotBlank() } ?: "",
        content = displayContent(prefs),
        createdAt = createdAt,
        status = ReelCommentStatus.Sent,
    )
