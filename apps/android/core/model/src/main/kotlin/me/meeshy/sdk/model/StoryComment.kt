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
)

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
    )
}

private fun ApiAuthor?.resolveName(): String {
    if (this == null) return ""
    return displayName?.takeIf { it.isNotBlank() }
        ?: username?.takeIf { it.isNotBlank() }
        ?: ""
}
