package me.meeshy.app.stories

import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.sdk.util.resolveServedImageUrl
import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.PostServedRing
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.story.isExpired
import me.meeshy.sdk.story.isFullyExpired

/** Le dessin de l'anneau : non lu = double épaisseur accentuée, lu = discret, aucun = pas d'anneau. */
enum class StoryRingEmphasis { Unread, Read, None }

/** Anneau d'une cellule : [equipped] = contour équipé de l'auteur (rendu par l'atome d'avatar). */
@Immutable
data class StoryRingStyle(
    val emphasis: StoryRingEmphasis,
    val widthDp: Float,
    val equipped: PostServedRing?,
) {
    companion object {
        fun resolve(liveCount: Int, hasUnviewed: Boolean, equipped: PostServedRing?): StoryRingStyle = when {
            liveCount <= 0 -> StoryRingStyle(StoryRingEmphasis.None, 0f, equipped)
            hasUnviewed -> StoryRingStyle(
                StoryRingEmphasis.Unread, StoryEntryMetrics.ringWidthAccented.value, equipped,
            )
            else -> StoryRingStyle(StoryRingEmphasis.Read, StoryEntryMetrics.ringWidthQuiet.value, equipped)
        }
    }
}

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
    /** Story que l'anneau MONTRE : première vivante non vue, sinon première vivante (iOS `StoryRailReach`). */
    val displayedStoryId: String? = null,
    val coverUrl: String? = null,
    /** Présence servie de l'auteur ; `null` = aucun point (jamais fabriquée). */
    val presence: PresenceState? = null,
    val style: StoryRingStyle = StoryRingStyle.resolve(storyCount, hasUnviewed, null),
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
        coverOf: (StoryGroup) -> String? = { it.avatarURL },
    ): StoryTrayPresentation {
        val rings = groups
            .filterNot { it.isFullyExpired(nowMillis) }
            .map { it.toRing(currentUserId, mediaBaseUrl, nowMillis, coverOf) }
        val self = rings.firstOrNull { it.isMine }
        val others = rings.filterNot { it.isMine }
        return StoryTrayPresentation(self = self, others = others)
    }

    private fun StoryGroup.toRing(
        currentUserId: String?,
        mediaBaseUrl: String?,
        nowMillis: Long,
        coverOf: (StoryGroup) -> String?,
    ): StoryRing {
        val live = stories.filterNot { it.isExpired(nowMillis) }
        val unviewed = live.count { !it.isViewed }
        return StoryRing(
            userId = id,
            displayName = username,
            avatarUrl = resolveServedImageUrl(coverOf(this), mediaBaseUrl),
            accentHex = avatarColor,
            hasUnviewed = unviewed > 0,
            storyCount = live.size,
            unviewedCount = unviewed,
            isMine = currentUserId != null && id == currentUserId,
            displayedStoryId = (live.firstOrNull { !it.isViewed } ?: live.firstOrNull())?.id,
            presence = authorPresence?.state(nowMillis),
            style = StoryRingStyle.resolve(live.size, unviewed > 0, authorRing),
        )
    }
}
