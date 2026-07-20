package me.meeshy.app.stories

import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.story.PendingStoryPublish
import java.time.Instant

/**
 * Projects in-flight outbox publishes ([PendingStoryPublish]) onto **optimistic
 * self-stories** for the tray.
 *
 * Surpasses iOS: where iOS keeps an in-memory optimistic story that evaporates on
 * process death, Android derives the optimism from the **durable outbox** itself
 * (single source of truth) — a queued story reappears after a kill, and rolls
 * back automatically the moment its publish exhausts (the repository stops
 * emitting it). This object only encodes the product rule "render a queued
 * publish as the signed-in user's newest story"; the queue semantics live in
 * [me.meeshy.sdk.story.StoryRepository.pendingPublishes].
 *
 * Pure: a synthetic [ApiPost] is built so the existing
 * `toStoryGroups` → `StoryTrayBuilder` pipeline groups it into the self ring with
 * no second code path.
 */
internal object StoryOptimisticTray {

    /** The signed-in author a pending story is attributed to. */
    data class SelfIdentity(val id: String, val username: String, val avatar: String?)

    /**
     * Synthetic self-authored [ApiPost]s for [publishes], or empty when there is
     * no signed-in [self] to attribute them to (a logged-out tray shows nothing
     * optimistic). Each is typed `STORY`, marked viewed-by-me (it is the user's
     * own), and stamped with the enqueue time so the grouping orders it newest.
     */
    fun pendingStories(
        publishes: List<PendingStoryPublish>,
        self: SelfIdentity?,
    ): List<ApiPost> {
        if (self == null) return emptyList()
        val author = ApiAuthor(id = self.id, username = self.username, avatar = self.avatar)
        return publishes.map { it.toSyntheticStory(author) }
    }

    /**
     * Merges the optimistic [pending] stories with the [cached] server feed,
     * preferring a real server story over a pending one that shares its id (a
     * defensive de-dup; pending ids are unique `pending_*` temp ids, so in
     * practice this is a no-op handoff). The cached feed keeps its order; pending
     * rows are appended (the self group orders by `createdAt` regardless).
     */
    fun merge(cached: List<ApiPost>, pending: List<ApiPost>): List<ApiPost> {
        if (pending.isEmpty()) return cached
        val cachedIds = cached.mapTo(HashSet()) { it.id }
        return cached + pending.filterNot { it.id in cachedIds }
    }

    private fun PendingStoryPublish.toSyntheticStory(author: ApiAuthor): ApiPost =
        ApiPost(
            id = tempId,
            type = "STORY",
            visibility = visibility,
            content = content,
            originalLanguage = originalLanguage,
            createdAt = Instant.ofEpochMilli(createdAtMillis).toString(),
            author = author,
            isViewedByMe = true,
        )
}
