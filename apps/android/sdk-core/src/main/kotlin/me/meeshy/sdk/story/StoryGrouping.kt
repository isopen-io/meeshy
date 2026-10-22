package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTranslation
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.playedEffects
import me.meeshy.sdk.model.republicationHasOwnContent
import me.meeshy.sdk.model.servedTrackingLinks
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


private fun ApiAuthor?.displayNameOrUsername(): String =
    (this?.displayName ?: this?.username)?.takeIf { it.isNotBlank() } ?: ""

private fun ApiPostMedia.toFeedMedia(): FeedMedia {
    val type = when {
        mimeType?.startsWith("video/") == true -> FeedMediaType.VIDEO
        mimeType?.startsWith("audio/") == true -> FeedMediaType.AUDIO
        else -> FeedMediaType.IMAGE
    }
    // Aplatit `captionTranslations` (carte → objet riche) en `langue → texte` —
    // la forme qu'attend `resolveLastMessagePreview` (#6280). Une traduction VIDE
    // n'en est pas une (règle #3 du Prisme) : elle est sautée ici, jamais portée
    // jusqu'au résolveur — mirror de `APIPostMedia.toFeedMedia` (PostModels.swift).
    val flatCaptionTranslations = captionTranslations
        ?.mapNotNull { (lang, entry) -> entry.text.takeIf { it.isNotBlank() }?.let { lang to it } }
        ?.toMap()
        ?.takeIf { it.isNotEmpty() }
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
        caption = caption,
        alt = alt,
        captionLanguage = captionLanguage,
        captionTranslations = flatCaptionTranslations,
    )
}

/**
 * 20h fallback baked into `expiresAt` at conversion ([StoryItem.DEFAULT_EXPIRY_MILLIS],
 * aligned on the server `EPHEMERAL_POST_TTL_HOURS.STORY`): a story without a server
 * expiry is considered live for 20h after creation.
 */
private fun ApiPost.effectiveStoryExpiresAt(): String? {
    expiresAt?.takeIf { it.isNotBlank() }?.let { return it }
    val created = isoToEpochMillis(createdAt)
    if (created <= 0L) return null
    return Instant.ofEpochMilli(created + StoryItem.DEFAULT_EXPIRY_MILLIS).toString()
}

/**
 * Canonical `APIPost -> StoryItem` projection (faithful port of the iOS mapper).
 * Public so the realtime viewer can re-project a `story:updated` payload through the
 * exact same conversion the initial `list()` load used — one source of truth for how
 * a wire story becomes a viewer slide item.
 */
public fun ApiPost.toStoryItem(): StoryItem {
    val translations = translations?.map { (lang, entry) ->
        StoryTranslation(language = lang, content = entry.text)
    }
    val totalReactions = reactionSummary?.values?.sum() ?: 0
    val source = repostOf
    val ownMedia = media.orEmpty()
    // `media` et `storyEffects` sont UNE décision (republicationHasOwnContent) : jamais
    // résolus séparément, leurs `postMediaId` se répondent. Les médias de la source
    // complètent les propres (dédupliqués par id) pour que la résolution trouve toujours sa cible.
    val hasOwnContent = republicationHasOwnContent(own = storyEffects, ownMediaIsEmpty = ownMedia.isEmpty())
    val ownIds = ownMedia.map { it.id }.toSet()
    val sourceMedia = source?.media.orEmpty()
    val mediaSource = if (hasOwnContent) ownMedia + sourceMedia.filterNot { it.id in ownIds } else sourceMedia
    return StoryItem(
        id = id,
        content = content,
        media = mediaSource.map { it.toFeedMedia() },
        storyEffects = playedEffects(own = storyEffects, ownMediaIsEmpty = ownMedia.isEmpty(), source = source?.storyEffects),
        createdAt = createdAt,
        expiresAt = effectiveStoryExpiresAt(),
        repostOfId = source?.id,
        originalRepostOfId = originalRepostOfId,
        repostAuthorName = source?.author.displayNameOrUsername().takeIf { it.isNotBlank() },
        repostAuthorUsername = source?.author?.username?.takeIf { it.isNotBlank() },
        visibility = visibility,
        visibilityUserIds = visibilityUserIds,
        audioUrl = audioUrl ?: source?.audioUrl,
        isViewed = isViewedByMe == true,
        updatedAt = updatedAt,
        contentEditedAt = contentEditedAt,
        translations = translations,
        reactionCount = totalReactions,
        commentCount = commentCount ?: 0,
        shareCount = shareCount,
        viewCount = viewCount,
        impressionCount = impressionCount,
        anonymousViewCount = anonymousViewCount,
        repostCount = repostCount,
        currentUserReactions = currentUserReactions,
        referenceAccess = referenceAccess,
        mentions = mentions,
        trackingLinks = servedTrackingLinks,
    )
}

/** `true` if any story in the group has not been seen by the viewer. */
public fun StoryGroup.hasUnviewed(): Boolean = stories.any { !it.isViewed }

/** The most recent story (stories are stored oldest-first). */
public fun StoryGroup.latestStory(): StoryItem? = stories.lastOrNull()

private fun StoryGroup.latestCreatedAtMillis(): Long =
    latestStory()?.let { isoToEpochMillis(it.createdAt) } ?: Long.MIN_VALUE

/** Effective expiry epoch-millis (20h fallback when no expiry is set at all). */
private fun StoryItem.effectiveExpiresAtMillis(): Long {
    val explicit = isoToEpochMillis(expiresAt)
    if (explicit > 0L) return explicit
    val created = isoToEpochMillis(createdAt)
    if (created <= 0L) return Long.MAX_VALUE
    return created + StoryItem.DEFAULT_EXPIRY_MILLIS
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
                authorPresence = posts.first().author?.isOnline?.let {
                    UserPresence(isOnline = it, lastActiveAt = posts.first().author?.lastActiveAt)
                },
                authorRing = posts.first().author?.avatarRing,
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

/**
 * The tray stripped of its dead stories, order preserved. A story is dead when its id is in
 * [deletedIds] (an explicit deletion, valid for everyone, author included) or when it is
 * expired AND not the current user's: the author keeps his own expired stories to read the
 * reactions and comments they gathered. A group emptied of stories leaves the tray. With
 * [nowMillis] `null` expiry is NOT evaluated — only [deletedIds] count (targeted removals).
 * Port of `[StoryGroup].purgingDeadStories` (StoryTrayPurge.swift).
 */
public fun List<StoryGroup>.purgingDeadStories(
    currentUserId: String?,
    deletedIds: Set<String> = emptySet(),
    nowMillis: Long? = System.currentTimeMillis(),
): List<StoryGroup> = mapNotNull { group ->
    val survivors = group.stories.filterNot { isDeadStory(it, group.id, currentUserId, deletedIds, nowMillis) }
    if (survivors.isEmpty()) null else group.copy(stories = survivors)
}

/** The ids [purgingDeadStories] would remove, in tray order (to unpin their media). */
public fun List<StoryGroup>.deadStoryIds(
    currentUserId: String?,
    deletedIds: Set<String> = emptySet(),
    nowMillis: Long? = System.currentTimeMillis(),
): List<String> = flatMap { group ->
    group.stories.filter { isDeadStory(it, group.id, currentUserId, deletedIds, nowMillis) }.map { it.id }
}

private fun isDeadStory(
    story: StoryItem,
    groupId: String,
    currentUserId: String?,
    deletedIds: Set<String>,
    nowMillis: Long?,
): Boolean {
    if (story.id in deletedIds) return true
    if (nowMillis == null) return false
    if (groupId == currentUserId) return false
    return story.isExpired(nowMillis)
}
