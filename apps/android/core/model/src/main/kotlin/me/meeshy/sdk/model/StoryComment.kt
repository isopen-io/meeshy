package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences

/** Delivery state of a story comment as the overlay renders it. */
enum class StoryCommentStatus {
    /** Optimistically shown, not yet acknowledged by the server. */
    Pending,

    /** Acknowledged by the server (REST ACK or realtime echo). */
    Sent,

    /** The optimistic post failed; the row offers a retry. */
    Failed,
}

/**
 * One comment under a story, as the comments overlay renders it — parity with iOS
 * `StoryCommentsView` rows + `StoryInteractionService` comments. A pure domain
 * value: the overlay shows the [authorName], optional [avatarUrl], the
 * Prisme-resolved [content] ([isTranslated] true when a translation was applied),
 * the [createdAt] timestamp (ISO-8601, `null` when omitted) and the delivery
 * [status]. While optimistic, [clientId] carries the device-local id so the
 * REST ACK / realtime echo can be reconciled against the right row.
 */
data class StoryComment(
    val id: String,
    val clientId: String?,
    val authorName: String,
    val avatarUrl: String?,
    val content: String,
    val isTranslated: Boolean,
    val createdAt: String?,
    val status: StoryCommentStatus,
    /** Le compte de l'auteur, d'où se lit son point de présence ; `null` pour un envoi encore optimiste. */
    val authorId: String? = null,
    /** Le commentaire racine auquel celui-ci répond ; `null` pour une racine. */
    val parentId: String? = null,
    /** Le nombre de réponses servi pour une racine (le fil dépend de lui, pas de ce qui est chargé). */
    val replyCount: Int = 0,
    val likeCount: Int = 0,
    /** Le cœur du lecteur sur ce commentaire (`currentUserReactions` contient ❤️). */
    val likedByMe: Boolean = false,
    val originalLanguage: String? = null,
    /** Le texte tel qu'écrit : la bascule original/traduit le rend sans nouvel appel. */
    val originalContent: String = content,
    /** Les traductions servies, gardées pour que la prochaine arrivée par socket se re-résolve par le Prisme. */
    val translations: Map<String, ApiPostTranslationEntry>? = null,
    val media: List<ApiPostMedia> = emptyList(),
    val location: SharedPlace? = null,
    val effectFlags: Int? = null,
)

/** Le cœur d'un commentaire de story : le seul emoji que la rangée sait poser (parité iOS `heartEmoji`). */
const val STORY_COMMENT_HEART: String = "❤️"

/** Vrai quand une traduction a été appliquée : la bascule « voir l'original » a quelque chose à montrer. */
val StoryComment.canShowOriginal: Boolean get() = isTranslated && originalContent != content

/** Le texte à afficher : l'original quand le lecteur l'a demandé, le texte servi par le Prisme sinon. */
fun StoryComment.displayedText(showOriginal: Boolean): String = if (showOriginal) originalContent else content

/** Re-résout le texte par le Prisme du lecteur, depuis les traductions gardées. */
fun StoryComment.resolved(prefs: ContentLanguagePreferences): StoryComment {
    val match = translations.preferredEntry(prefs, originalLanguage)
    return copy(content = match?.text ?: originalContent, isTranslated = match != null)
}

/**
 * Maps a wire comment to its domain value, resolving the body through the Prisme
 * Linguistique: when a translation targets a preferred language it is shown
 * ([isTranslated] = true), otherwise the original content is shown (Rule 1 — never
 * an arbitrary translation). The comment's [ApiPostComment.originalLanguage] competes
 * at its own rank: a comment already written in the reader's primary language is not
 * replaced by a translation into a lower-ranked one. The author name falls back
 * display name → username → empty, guarding blanks so a whitespace name never renders
 * an empty row, and a blank avatar collapses to `null`. A wire comment is always
 * [StoryCommentStatus.Sent].
 */
fun ApiPostComment.toStoryComment(prefs: ContentLanguagePreferences): StoryComment {
    val match = translations.preferredEntry(prefs, originalLanguage)
    return StoryComment(
        id = id,
        clientId = null,
        authorName = author.resolveName(),
        avatarUrl = author?.avatar?.takeIf { it.isNotBlank() },
        content = match?.text ?: content,
        isTranslated = match != null,
        createdAt = createdAt,
        status = StoryCommentStatus.Sent,
        authorId = author?.id?.takeIf { it.isNotBlank() },
        parentId = parentId?.takeIf { it.isNotBlank() },
        replyCount = replyCount ?: 0,
        likeCount = likeCount ?: 0,
        likedByMe = currentUserReactions?.contains(STORY_COMMENT_HEART) == true,
        originalLanguage = originalLanguage,
        originalContent = content,
        translations = translations,
        media = media.orEmpty(),
        location = location,
        effectFlags = effectFlags,
    )
}

private fun ApiAuthor?.resolveName(): String {
    if (this == null) return ""
    return displayName?.takeIf { it.isNotBlank() }
        ?: username?.takeIf { it.isNotBlank() }
        ?: ""
}
