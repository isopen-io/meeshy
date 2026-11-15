package me.meeshy.app.reels

import me.meeshy.app.feed.PostImagerRequest
import me.meeshy.app.stories.StoryVideoExport
import me.meeshy.sdk.model.card.PostCardImaging
import me.meeshy.sdk.model.card.PostCommentCardAuthor
import me.meeshy.sdk.model.isoToEpochMillisOrNull

internal fun ReelPresentation.imagerRequest(export: StoryVideoExport): PostImagerRequest? {
    val scene = this.export ?: return null
    val card = PostCardImaging.sceneCardOf(
        author = PostCommentCardAuthor(id = authorId.orEmpty(), displayName = authorName, username = username),
        text = caption.orEmpty(),
        createdAtMillis = isoToEpochMillisOrNull(createdAtIso) ?: 0L,
    )
    return PostImagerRequest(key = "post:$id", card = card, render = { rendered -> export.renderCard(listOf(scene), rendered) })
}
