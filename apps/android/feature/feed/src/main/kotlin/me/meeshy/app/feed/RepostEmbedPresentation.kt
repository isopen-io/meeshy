package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated

/**
 * A reposted/quoted post projected for the embedded quote cell rendered inside a
 * feed card (and the post-detail screen). Pure data — built by [RepostEmbedBuilder]
 * so the Prisme resolution and media-preview logic stay unit-testable and the
 * Compose layer stays dumb.
 *
 * The [id] is the ORIGINAL reposted post's id (the embed's tap target), never the
 * outer reposter card's id — mirrors iOS `FeedPostCard.repostTapTargetId`.
 */
@Immutable
data class RepostEmbedPresentation(
    val id: String,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val previewImageUrl: String?,
    val extraMediaCount: Int,
    val isQuote: Boolean,
    val isStory: Boolean,
    val isReel: Boolean,
)

object RepostEmbedBuilder {

    /**
     * Project [repost] for the embedded quote cell, or `null` when the post is not
     * a repost. Content follows the Prisme Linguistique (preferred translation, or
     * the original when none is preferred — Rule 1, never an arbitrary translation).
     */
    fun build(
        repost: ApiRepostOf?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): RepostEmbedPresentation? {
        repost ?: return null
        val mediaCount = repost.media?.size ?: 0
        return RepostEmbedPresentation(
            id = repost.id,
            authorName = (repost.author?.displayName ?: repost.author?.username)
                ?.takeIf { it.isNotBlank() },
            authorAvatarUrl = repost.author?.avatar
                ?.takeIf { it.isNotBlank() }
                ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            createdAtIso = repost.createdAt,
            content = repost.displayContent(preferences),
            isTranslated = repost.isTranslated(preferences),
            previewImageUrl = repost.media
                ?.firstOrNull()
                ?.let { it.thumbnailUrl ?: it.fileUrl }
                ?.takeIf { it.isNotBlank() }
                ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            extraMediaCount = (mediaCount - 1).coerceAtLeast(0),
            isQuote = repost.isQuote == true,
            isStory = repost.type.equals("story", ignoreCase = true),
            isReel = repost.type.equals("reel", ignoreCase = true),
        )
    }
}
