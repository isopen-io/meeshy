package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.bubble.PostLanguageStrip

/** An image attachment ready for display in a feed card. */
@Immutable
data class FeedPostImage(
    val id: String,
    val url: String,
    val thumbnailUrl: String?,
    val width: Int?,
    val height: Int?,
)

/**
 * A feed post projected for rendering: Prisme-resolved content, the viewer's own
 * like state (never inferred from the public count) and resolved media URLs.
 *
 * Pure data — built by [FeedPostBuilder] so the resolution is unit-testable and
 * the Compose layer stays dumb.
 */
@Immutable
data class FeedPostPresentation(
    val id: String,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val languageStrip: List<LanguageChip>,
    val moodEmoji: String?,
    val images: List<FeedPostImage>,
    val likeCount: Int,
    val isLiked: Boolean,
    val bookmarkCount: Int,
    val isBookmarked: Boolean,
    val commentCount: Int,
    val repostCount: Int,
    val isPinned: Boolean,
    val isEdited: Boolean,
    val isReel: Boolean,
)

object FeedPostBuilder {

    /**
     * Project [post] for rendering.
     *
     * @param activeLanguageCode the language the viewer switched the post to via a
     *   flag tap (null → the default Prisme resolution). When it names a language
     *   the post carries — a translation or the original — the displayed content and
     *   the strip's active chip both follow it; an unknown/content-less override is
     *   ignored and the default resolution stands. Mirrors the chat bubble's
     *   single-primary language switch, keyed per post rather than per message.
     */
    fun build(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
        activeLanguageCode: String? = null,
    ): FeedPostPresentation {
        val images = post.media
            .orEmpty()
            .filter { it.isImage && it.fileUrl != null }
            .sortedBy { it.order ?: Int.MAX_VALUE }
            .map { media ->
                FeedPostImage(
                    id = media.id,
                    url = resolveMediaUrl(media.fileUrl!!, mediaBaseUrl),
                    thumbnailUrl = media.thumbnailUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    width = media.width,
                    height = media.height,
                )
            }
        val originalCode = post.originalLanguage.normalizedCode()
        val isTranslated = post.isTranslated(preferences)
        val activeCode = resolveActiveCode(post, preferences, activeLanguageCode)
        val activeIsOriginal = activeCode == null || activeCode == originalCode
        return FeedPostPresentation(
            id = post.id,
            authorName = (post.author?.displayName ?: post.author?.username)
                ?.takeIf { it.isNotBlank() },
            authorAvatarUrl = post.author?.avatar
                ?.let { resolveMediaUrl(it, mediaBaseUrl) },
            createdAtIso = post.createdAt,
            content = resolveContent(post, preferences, activeCode, activeIsOriginal),
            isTranslated = isTranslated,
            languageStrip = PostLanguageStrip.build(
                originalLanguage = post.originalLanguage,
                translations = post.translations,
                preferences = preferences,
                showingOriginal = isTranslated && activeIsOriginal,
                activeCodeOverride = activeCode,
            ),
            moodEmoji = post.moodEmoji?.takeIf { it.isNotBlank() },
            images = images,
            likeCount = post.likeCount ?: 0,
            isLiked = post.isLikedByMe == true,
            bookmarkCount = post.bookmarkCount ?: 0,
            isBookmarked = post.isBookmarkedByMe == true,
            commentCount = post.commentCount ?: 0,
            repostCount = post.repostCount ?: 0,
            isPinned = post.isPinned == true,
            isEdited = post.isEdited == true,
            isReel = post.type.equals("reel", ignoreCase = true),
        )
    }

    /**
     * The effective displayed language for [post]: the viewer's [override] when it
     * names a language the post actually carries (a translation or the original),
     * else the default Prisme resolution — the preferred translation, or the
     * original when none is preferred. Shared by [build] and the ViewModel's
     * flag-tap handler so the switch decision has one source of truth.
     */
    fun resolveActiveCode(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        override: String?,
    ): String? {
        val originalCode = post.originalLanguage.normalizedCode()
        val preferredCode = LanguageResolver
            .preferredTranslation(post.translations.toTranslationRows(), preferences)
            ?.targetLanguage?.normalizedCode()
        val requested = override.normalizedCode()?.takeIf { it.hasContentIn(post, originalCode) }
        return requested ?: (preferredCode ?: originalCode)
    }

    private fun resolveContent(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        activeCode: String?,
        activeIsOriginal: Boolean,
    ): String = when {
        activeIsOriginal -> post.content.orEmpty()
        else -> post.translations
            ?.entries
            ?.firstOrNull { it.key.normalizedCode() == activeCode && it.value.text.isNotBlank() }
            ?.value?.text
            ?: post.displayContent(preferences)
    }

    private fun String.hasContentIn(post: ApiPost, originalCode: String?): Boolean =
        this == originalCode || post.translations?.any {
            it.key.normalizedCode() == this && it.value.text.isNotBlank()
        } == true

    private fun Map<String, ApiPostTranslationEntry>?.toTranslationRows():
        List<LanguageResolver.TranslationLike> =
        this?.map { (code, entry) -> PostTranslationRow(code, entry.text) }.orEmpty()

    private data class PostTranslationRow(
        override val targetLanguage: String,
        override val translatedContent: String,
    ) : LanguageResolver.TranslationLike

    private fun String?.normalizedCode(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

    private val ApiPostMedia.isImage: Boolean
        get() = mimeType?.startsWith("image/") == true

    private fun resolveMediaUrl(url: String, mediaBaseUrl: String?): String = when {
        url.startsWith("http") -> url
        mediaBaseUrl == null -> url
        else -> mediaBaseUrl.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
    }
}
