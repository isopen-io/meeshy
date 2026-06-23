package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.story.hasUnviewed
import me.meeshy.sdk.story.isFullyExpired

/** A single author's story ring, projected for the tray. Pure data. */
@Immutable
data class StoryRing(
    val userId: String,
    val displayName: String,
    val avatarUrl: String?,
    val accentHex: String,
    val hasUnviewed: Boolean,
    val storyCount: Int,
    val unviewedCount: Int,
    val isMine: Boolean,
)

/**
 * The story tray, split into the viewer's own ring (rendered first, doubling as
 * the "add" affordance) and everyone else's, preserving the group ordering
 * produced by `toStoryGroups`.
 */
@Immutable
data class StoryTrayPresentation(
    val self: StoryRing?,
    val others: List<StoryRing>,
) {
    val isEmpty: Boolean get() = self == null && others.isEmpty()
}

object StoryTrayBuilder {

    fun build(
        groups: List<StoryGroup>,
        currentUserId: String?,
        mediaBaseUrl: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): StoryTrayPresentation {
        val rings = groups
            .filterNot { it.isFullyExpired(nowMillis) }
            .map { it.toRing(currentUserId, mediaBaseUrl) }
        val self = rings.firstOrNull { it.isMine }
        val others = rings.filterNot { it.isMine }
        return StoryTrayPresentation(self = self, others = others)
    }

    private fun StoryGroup.toRing(currentUserId: String?, mediaBaseUrl: String?): StoryRing =
        StoryRing(
            userId = id,
            displayName = username,
            avatarUrl = avatarURL?.let { resolveMediaUrl(it, mediaBaseUrl) },
            accentHex = avatarColor,
            hasUnviewed = hasUnviewed(),
            storyCount = stories.size,
            unviewedCount = stories.count { !it.isViewed },
            isMine = currentUserId != null && id == currentUserId,
        )
}

internal fun resolveMediaUrl(url: String, mediaBaseUrl: String?): String = when {
    url.startsWith("http") -> url
    mediaBaseUrl == null -> url
    else -> mediaBaseUrl.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
}
