package me.meeshy.sdk.status

import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.theme.DynamicColorGenerator

/**
 * `APIPost -> StatusEntry` conversion + bar projection — faithful port of
 * `APIPost.toStatusEntry()` (StoryModels.swift) and the `StatusViewModel` bar
 * ordering (own status first, then others in server order, deduped).
 *
 * Pure and stateless — a building block the status repository / bar view-model
 * consume. Android **surpasses iOS** by carrying `visibility` + `reactionSummary`
 * through the mapper (the iOS converter drops both).
 */

private const val ANONYMOUS_NAME = "Anonymous"

private fun ApiAuthor.resolvedName(): String =
    displayName?.takeIf { it.isNotBlank() }
        ?: username?.takeIf { it.isNotBlank() }
        ?: ANONYMOUS_NAME

/**
 * Maps a post into a [StatusEntry], or `null` when it is not a mood status: the
 * post must be `type == "STATUS"` (case-insensitive), carry a non-blank
 * [ApiPost.moodEmoji], and have an [ApiPost.author]. Mirrors the iOS guard.
 */
public fun ApiPost.toStatusEntry(): StatusEntry? {
    if ((type ?: "").uppercase() != "STATUS") return null
    val emoji = moodEmoji?.takeIf { it.isNotBlank() } ?: return null
    val postAuthor = author ?: return null
    val name = postAuthor.resolvedName()
    return StatusEntry(
        id = id,
        userId = postAuthor.id,
        username = name,
        avatarColor = DynamicColorGenerator.colorForName(name),
        moodEmoji = emoji,
        content = content,
        audioUrl = audioUrl,
        createdAt = createdAt,
        expiresAt = expiresAt,
        visibility = visibility,
        reactionSummary = reactionSummary,
        viaUsername = viaUsername ?: repostOf?.author?.username,
    )
}

/** Maps only the mood statuses out of a feed page, preserving server order. */
public fun List<ApiPost>.toStatusEntries(): List<StatusEntry> = mapNotNull { it.toStatusEntry() }

/**
 * Orders entries for the statuses bar: the [currentUserId]'s own status first,
 * then the rest in their existing order, deduped by id (first occurrence wins).
 * Mirrors the iOS bar which renders `myStatus` then `statuses.filter { it.id != myStatus.id }`.
 */
public fun List<StatusEntry>.orderedForBar(currentUserId: String?): List<StatusEntry> {
    val ordered = if (currentUserId == null) {
        this
    } else {
        val (own, others) = partition { it.userId == currentUserId }
        own + others
    }
    val seen = HashSet<String>()
    return ordered.filter { seen.add(it.id) }
}
