package me.meeshy.app.stories

import me.meeshy.app.feed.PostImagerRequest
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.card.PostCardImaging
import me.meeshy.sdk.model.card.PostCommentCardAuthor
import me.meeshy.sdk.model.isoToEpochMillisOrNull

internal fun storyImagerRequest(
    item: StoryItem?,
    slide: StorySlideView?,
    state: StoryViewerUiState,
    export: StoryVideoExport,
): PostImagerRequest? {
    if (item == null || slide == null) return null
    val card = PostCardImaging.sceneCardOf(
        author = PostCommentCardAuthor(id = state.authorUserId.orEmpty(), displayName = state.authorName),
        text = slide.text,
        createdAtMillis = isoToEpochMillisOrNull(item.createdAt) ?: 0L,
    )
    return PostImagerRequest(key = "story:${item.id}", card = card, render = { rendered -> export.renderCard(listOf(item to slide), rendered) })
}
