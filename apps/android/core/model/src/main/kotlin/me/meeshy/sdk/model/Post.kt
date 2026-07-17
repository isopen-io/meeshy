package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.LanguageResolver

/** A post author — port of APIAuthor (PostModels.swift). */
@Serializable
data class ApiAuthor(
    val id: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
)

/** A media item on a post — port of APIPostMedia (PostModels.swift). */
@Serializable
data class ApiPostMedia(
    val id: String,
    val fileName: String? = null,
    val originalName: String? = null,
    val mimeType: String? = null,
    val fileSize: Int? = null,
    val fileUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val duration: Int? = null,
    val order: Int? = null,
    val caption: String? = null,
    val alt: String? = null,
    val transcription: ApiAttachmentTranscription? = null,
    val translations: Map<String, ApiAttachmentTranslation>? = null,
)

/** A post/comment translation entry — port of APIPostTranslationEntry (PostModels.swift). */
@Serializable
data class ApiPostTranslationEntry(
    val text: String = "",
    val translationModel: String? = null,
    val confidenceScore: Double? = null,
    val createdAt: String? = null,
)

/** The post a repost references — port of APIRepostOf (PostModels.swift). */
@Serializable
data class ApiRepostOf(
    val id: String,
    val type: String? = null,
    val content: String? = null,
    val originalLanguage: String? = null,
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    val storyEffects: StoryEffects? = null,
    val audioUrl: String? = null,
    val originalRepostOfId: String? = null,
    val author: ApiAuthor? = null,
    val media: List<ApiPostMedia>? = null,
    val createdAt: String? = null,
    val likeCount: Int? = null,
    val commentCount: Int? = null,
    val isQuote: Boolean? = null,
)

/** A comment on a post — port of APIPostComment (PostModels.swift). */
@Serializable
data class ApiPostComment(
    val id: String,
    val content: String = "",
    val originalLanguage: String? = null,
    val parentId: String? = null,
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    val likeCount: Int? = null,
    val replyCount: Int? = null,
    val effectFlags: Int? = null,
    val createdAt: String? = null,
    val author: ApiAuthor? = null,
    val currentUserReactions: List<String>? = null,
)

/** A post — port of APIPost (PostModels.swift). */
@Serializable
data class ApiPost(
    val id: String,
    val type: String? = null,
    val visibility: String? = null,
    val content: String? = null,
    val originalLanguage: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val expiresAt: String? = null,
    val author: ApiAuthor? = null,
    val likeCount: Int? = null,
    val commentCount: Int? = null,
    val repostCount: Int? = null,
    val viewCount: Int? = null,
    val bookmarkCount: Int? = null,
    val shareCount: Int? = null,
    val reactionSummary: Map<String, Int>? = null,
    val isPinned: Boolean? = null,
    val isEdited: Boolean? = null,
    val media: List<ApiPostMedia>? = null,
    val comments: List<ApiPostComment>? = null,
    val repostOf: ApiRepostOf? = null,
    val originalRepostOfId: String? = null,
    val isQuote: Boolean? = null,
    val moodEmoji: String? = null,
    val audioUrl: String? = null,
    val audioDuration: Int? = null,
    val storyEffects: StoryEffects? = null,
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    val isLikedByMe: Boolean? = null,
    val isBookmarkedByMe: Boolean? = null,
    val isViewedByMe: Boolean? = null,
    val currentUserReactions: List<String>? = null,
    val mentionedUsers: List<MentionedUser>? = null,
    val viaUsername: String? = null,
)

/**
 * Prisme Linguistique resolution for posts. Post translations are a
 * language-keyed map (vs. the message list form), so we walk the preferred
 * languages and pick the first non-blank match — never an arbitrary entry.
 */
private fun Map<String, ApiPostTranslationEntry>?.preferredEntry(
    prefs: LanguageResolver.ContentLanguagePreferences,
): ApiPostTranslationEntry? {
    val translations = this?.takeIf { it.isNotEmpty() } ?: return null
    for (language in LanguageResolver.preferredContentLanguages(prefs)) {
        val match = translations.entries.firstOrNull { (key, entry) ->
            key.equals(language, ignoreCase = true) && entry.text.isNotBlank()
        }?.value
        if (match != null) return match
    }
    return null
}

/**
 * Content to display under the Prisme Linguistique: the preferred translation,
 * or the original [content] when no translation targets a preferred language.
 */
fun ApiPost.displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
    translations.preferredEntry(prefs)?.text ?: content.orEmpty()

/** True when the displayed content is a translation rather than the original. */
fun ApiPost.isTranslated(prefs: LanguageResolver.ContentLanguagePreferences): Boolean =
    translations.preferredEntry(prefs) != null

/** A viewer of a post — port of APIPostViewer (PostModels.swift). */
@Serializable
data class ApiPostViewer(
    val id: String,
    val userId: String = "",
    val viewedAt: String? = null,
    val duration: Int? = null,
    val user: ApiAuthor? = null,
)

@Serializable
data class PostViewersResponse(
    val items: List<ApiPostViewer> = emptyList(),
    val pagination: PostViewersPagination? = null,
)

@Serializable
data class PostViewersPagination(
    val total: Int = 0,
    val offset: Int = 0,
    val limit: Int = 0,
    val hasMore: Boolean = false,
)
