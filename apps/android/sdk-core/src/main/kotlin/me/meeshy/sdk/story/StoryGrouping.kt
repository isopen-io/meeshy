package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTranslation
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.theme.DynamicColorGenerator
import java.time.Instant

/**
 * `APIPost[] -> StoryGroup[]` conversion + group/expiry helpers — faithful port
 * of `Array<APIPost>.toStoryGroups`, `StoryGroup.hasUnviewed/latestStory/
 * isFullyExpired` and `StoryItem.isExpired` (StoryModels.swift).
 *
 * Pure: `nowMillis` is injected so expiry is deterministic and testable.
 */

private const val STORY_DEFAULT_TTL_HOURS = 21L
private const val STORY_NO_EXPIRY_FALLBACK_HOURS = 24L
private const val MILLIS_PER_HOUR = 60L * 60L * 1000L

private fun ApiAuthor?.displayNameOrUsername(): String =
    (this?.displayName ?: this?.username)?.takeIf { it.isNotBlank() } ?: ""

private fun ApiPostMedia.toFeedMedia(): FeedMedia {
    val type = when {
        mimeType?.startsWith("video/") == true -> FeedMediaType.VIDEO
        mimeType?.startsWith("audio/") == true -> FeedMediaType.AUDIO
        else -> FeedMediaType.IMAGE
    }
    return FeedMedia(
        id = id,
        type = type,
        url = fileUrl,
        thumbnailUrl = thumbnailUrl,
        thumbHash = thumbHash,
        thumbnailColor = "4ECDC4",
        width = width,
        height = height,
        duration = duration?.let { it / 1000 },
    )
}

/**
 * 21h fallback baked into `expiresAt` at conversion (matches the iOS tray): a
 * story without a server expiry is considered live for 21h after creation.
 */
private fun ApiPost.effectiveStoryExpiresAt(): String? {
    expiresAt?.takeIf { it.isNotBlank() }?.let { return it }
    val created = isoToEpochMillis(createdAt)
    if (created <= 0L) return null
    return Instant.ofEpochMilli(created + STORY_DEFAULT_TTL_HOURS * MILLIS_PER_HOUR).toString()
}

private fun ApiPost.toStoryItem(): StoryItem {
    val translations = translations?.map { (lang, entry) ->
        StoryTranslation(language = lang, content = entry.text)
    }
    val totalReactions = reactionSummary?.values?.sum() ?: 0
    return StoryItem(
        id = id,
        content = content,
        media = media.orEmpty().map { it.toFeedMedia() },
        storyEffects = storyEffects,
        createdAt = createdAt,
        expiresAt = effectiveStoryExpiresAt(),
        repostOfId = repostOf?.id,
        originalRepostOfId = originalRepostOfId,
        repostAuthorName = repostOf?.author.displayNameOrUsername().takeIf { it.isNotBlank() },
        visibility = visibility,
        audioUrl = audioUrl,
        isViewed = isViewedByMe == true,
        translations = translations,
        reactionCount = totalReactions,
        commentCount = commentCount ?: 0,
    )
}

/** `true` if any story in the group has not been seen by the viewer. */
public fun StoryGroup.hasUnviewed(): Boolean = stories.any { !it.isViewed }

/** The most recent story (stories are stored oldest-first). */
public fun StoryGroup.latestStory(): StoryItem? = stories.lastOrNull()

private fun StoryGroup.latestCreatedAtMillis(): Long =
    latestStory()?.let { isoToEpochMillis(it.createdAt) } ?: Long.MIN_VALUE

/** Effective expiry epoch-millis (24h fallback when no expiry is set at all). */
private fun StoryItem.effectiveExpiresAtMillis(): Long {
    val explicit = isoToEpochMillis(expiresAt)
    if (explicit > 0L) return explicit
    val created = isoToEpochMillis(createdAt)
    if (created <= 0L) return Long.MAX_VALUE
    return created + STORY_NO_EXPIRY_FALLBACK_HOURS * MILLIS_PER_HOUR
}

/** Whether this story has expired at [nowMillis]. */
public fun StoryItem.isExpired(nowMillis: Long = System.currentTimeMillis()): Boolean =
    effectiveExpiresAtMillis() <= nowMillis

/** Whether every story in the group has expired (the tray hides such groups). */
public fun StoryGroup.isFullyExpired(nowMillis: Long = System.currentTimeMillis()): Boolean =
    stories.all { it.isExpired(nowMillis) }

/**
 * Group story posts by author and order them for the tray:
 * current user first, then unviewed groups, then by most-recent story descending.
 */
public fun List<ApiPost>.toStoryGroups(
    currentUserId: String? = null,
    nowMillis: Long = System.currentTimeMillis(),
): List<StoryGroup> {
    val storyPosts = filter { (it.type ?: "").uppercase() == "STORY" && it.author != null }
    val grouped = LinkedHashMap<String, MutableList<ApiPost>>()
    for (post in storyPosts) {
        grouped.getOrPut(post.author!!.id) { mutableListOf() }.add(post)
    }
    return grouped
        .map { (authorId, posts) ->
            val name = posts.first().author.displayNameOrUsername()
            StoryGroup(
                id = authorId,
                username = name,
                avatarColor = DynamicColorGenerator.colorForName(name),
                avatarURL = posts.first().author?.avatar,
                stories = posts
                    .sortedBy { isoToEpochMillis(it.createdAt) }
                    .map { it.toStoryItem() },
            )
        }
        .sortedWith(storyGroupOrder(currentUserId))
}

private fun storyGroupOrder(currentUserId: String?): Comparator<StoryGroup> =
    Comparator { a, b ->
        if (currentUserId != null) {
            if (a.id == currentUserId && b.id != currentUserId) return@Comparator -1
            if (b.id == currentUserId && a.id != currentUserId) return@Comparator 1
        }
        if (a.hasUnviewed() != b.hasUnviewed()) {
            return@Comparator if (a.hasUnviewed()) -1 else 1
        }
        b.latestCreatedAtMillis().compareTo(a.latestCreatedAtMillis())
    }
