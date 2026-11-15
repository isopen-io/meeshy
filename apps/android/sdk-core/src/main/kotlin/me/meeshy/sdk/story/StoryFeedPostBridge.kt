package me.meeshy.sdk.story

import me.meeshy.sdk.model.FeedPost
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.TrackedLink
import me.meeshy.sdk.model.playedStoryEffects
import me.meeshy.sdk.model.republicationHasOwnContent
import me.meeshy.sdk.model.republishedStory

/**
 * Synthesizes a [StoryItem] from a story [FeedPost] (post-detail inline rendering) — port of
 * `StoryItem(feedPost:)` (StoryItem+FeedPostBridge.swift). A [FeedPost] has no `expiresAt`,
 * which is irrelevant to in-place playback.
 *
 * REPUBLICATION: when the post reposts a STORY without own additions its effects/audio are
 * null and its media empty — the content lives on the source. `media` and `storyEffects`
 * are ONE fallback decision (republicationHasOwnContent), never resolved independently:
 * effects reference their media by `postMediaId`, so mixing the two would silently break
 * every audio/video resolution. Same policy as `ApiPost.toStoryItem`.
 */
public fun FeedPost.toStoryItem(): StoryItem {
    val source = republishedStory
    val hasOwnContent = republicationHasOwnContent(own = storyEffects, ownMediaIsEmpty = media.isEmpty())
    return StoryItem(
        id = id,
        content = content,
        media = if (hasOwnContent) media else source?.media.orEmpty(),
        storyEffects = playedStoryEffects,
        createdAt = timestamp,
        expiresAt = null,
        repostOfId = source?.id,
        repostAuthorName = source?.author,
        repostAuthorUsername = source?.authorUsername,
        audioUrl = audioUrl ?: source?.audioUrl,
        isViewed = false,
        trackingLinks = trackedLinkMap.map { (url, token) -> TrackedLink(url = url, token = token) },
    )
}
