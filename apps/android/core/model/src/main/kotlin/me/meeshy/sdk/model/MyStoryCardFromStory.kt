package me.meeshy.sdk.model

/**
 * La carte « Mes stories » d'une story publiée — la vignette vient du premier média (sa
 * miniature d'abord), sinon du fond uni de la scène ; l'expiration retombe sur 20 h après la
 * création quand la passerelle n'en sert pas (même repli que le plateau).
 */
fun MyStoryCardRules.fromStory(story: StoryItem, viewCount: Int): MyStoryCardModel {
    val created = isoToEpochMillisOrNull(story.createdAt) ?: 0L
    val explicitExpiry = isoToEpochMillisOrNull(story.expiresAt)?.takeIf { it > 0L }
    val first = story.media.firstOrNull()
    return published(
        MyStoryCardRules.PublishedInput(
            id = story.id,
            thumbnailUrl = first?.thumbnailUrl?.takeIf { it.isNotBlank() } ?: first?.url?.takeIf { it.isNotBlank() },
            renderedCoverPath = null,
            backgroundHex = story.storyEffects?.background,
            createdAtEpochMillis = created,
            expiresAtEpochMillis = explicitExpiry ?: created.takeIf { it > 0L }?.plus(StoryItem.DEFAULT_EXPIRY_MILLIS),
            viewCount = viewCount,
            reactionCount = story.reactionCount,
            commentCount = story.commentCount,
        ),
    )
}
