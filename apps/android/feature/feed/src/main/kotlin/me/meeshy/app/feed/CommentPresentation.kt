package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.bubble.PostLanguageStrip

/**
 * A comment projected for rendering: author, Prisme-resolved content, the language
 * explorer strip, reply awareness, and the optimistic-pending flag. Pure data — built
 * by [CommentProjection] so the resolution stays unit-testable and the Compose layer
 * stays dumb.
 */
@Immutable
data class CommentPresentation(
    val id: String,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val languageStrip: List<LanguageChip>,
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
     *
     * @param activeLanguageCode the language the viewer switched this comment to via a
     *   flag tap (null → the default Prisme resolution). When it names a language the
     *   comment carries — a translation or the original — the displayed content and the
     *   strip's active chip both follow it; an unknown/content-less override is ignored
     *   and the default resolution stands. Mirror of [FeedPostBuilder.build], keyed per
     *   comment rather than per post.
     */
    fun build(
        comment: ApiPostComment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        isPending: Boolean = false,
        likeState: CommentLikeState = CommentLikeState(),
        activeLanguageCode: String? = null,
    ): CommentPresentation {
        val originalCode = comment.originalLanguage.normalizedCode()
        val isTranslated = comment.isTranslated(preferences)
        val activeCode = resolveActiveCode(comment, preferences, activeLanguageCode)
        val activeIsOriginal = activeCode == null || activeCode == originalCode
        return CommentPresentation(
            id = comment.id,
            authorName = (comment.author?.displayName ?: comment.author?.username)
                ?.takeIf { it.isNotBlank() },
            authorAvatarUrl = comment.author?.avatar
                ?.takeIf { it.isNotBlank() }
                ?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            createdAtIso = comment.createdAt,
            content = resolveContent(comment, preferences, activeCode, activeIsOriginal),
            isTranslated = isTranslated,
            languageStrip = PostLanguageStrip.build(
                originalLanguage = comment.originalLanguage,
                translations = comment.translations,
                preferences = preferences,
                showingOriginal = isTranslated && activeIsOriginal,
                activeCodeOverride = activeCode,
            ),
            likeCount = likeState.displayCount(comment.id, comment.likeCount ?: 0),
            isLiked = likeState.isLiked(comment.id),
            replyCount = comment.replyCount ?: 0,
            parentId = comment.parentId?.takeIf { it.isNotBlank() },
            isReply = !comment.parentId.isNullOrBlank(),
            isPending = isPending,
        )
    }

    /**
     * The effective displayed language for [comment]: the viewer's [override] when it
     * names a language the comment actually carries (a translation or the original),
     * else the default Prisme resolution — the preferred translation, or the original
     * when none is preferred. Shared by [build] and the ViewModel's flag-tap handler so
     * the switch decision has one source of truth. Mirror of [FeedPostBuilder.resolveActiveCode].
     */
    fun resolveActiveCode(
        comment: ApiPostComment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        override: String?,
    ): String? {
        val originalCode = comment.originalLanguage.normalizedCode()
        val preferredCode = LanguageResolver
            .preferredTranslation(comment.translations.toTranslationRows(), preferences)
            ?.targetLanguage?.normalizedCode()
        val requested = override.normalizedCode()?.takeIf { it.hasContentIn(comment, originalCode) }
        return requested ?: (preferredCode ?: originalCode)
    }

    private fun resolveContent(
        comment: ApiPostComment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        activeCode: String?,
        activeIsOriginal: Boolean,
    ): String = when {
        activeIsOriginal -> comment.content
        else -> comment.translations
            ?.entries
            ?.firstOrNull { it.key.normalizedCode() == activeCode && it.value.text.isNotBlank() }
            ?.value?.text
            ?: comment.displayContent(preferences)
    }

    private fun String.hasContentIn(comment: ApiPostComment, originalCode: String?): Boolean =
        this == originalCode || comment.translations?.any {
            it.key.normalizedCode() == this && it.value.text.isNotBlank()
        } == true

    private fun String?.normalizedCode(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
