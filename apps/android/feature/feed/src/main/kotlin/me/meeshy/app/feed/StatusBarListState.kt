package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.status.StatusPage

/**
 * Pure, immutable accumulation state for the mood-statuses bar — the SSOT of the
 * list inside [StatusesViewModel]. Lifts the `statuses` / `nextCursor` / `hasMore`
 * trio into a testable value type so the pagination and the optimistic
 * create/remove/react laws stay unit-covered independently of the ViewModel.
 *
 * The first page (and every refresh) folds onto a cold [StatusBarListState]; each
 * fetched page is [appended] de-duplicating by status id so a page re-including a
 * boundary entry never doubles it, advancing [cursor]/[hasMore] to the gateway's
 * pagination meta. An optimistic [created] status is hoisted to the front, [removed]
 * drops one instantly, and [reacted] bumps a reaction count — each returning a new
 * value so a rollback is a plain snapshot restore. Bar ordering (own-first, dedup)
 * is the `orderedForBar` SSOT applied at projection time, not stored here.
 */
@Immutable
data class StatusBarListState(
    val statuses: List<StatusEntry> = emptyList(),
    val cursor: String? = null,
    val hasMore: Boolean = true,
    val hasLoaded: Boolean = false,
) {
    /**
     * Whether an additional page can be fetched: the gateway still reports [hasMore]
     * **and** it handed back a [cursor] to fetch from. Both are required — a `hasMore`
     * with no cursor (a malformed tail) must not spin an unbounded fetch loop.
     */
    val canLoadMore: Boolean get() = hasMore && cursor != null

    /**
     * Fold a freshly-fetched [page] onto the list: append only the statuses whose id
     * is not already present (order preserved: existing first, then new arrivals), and
     * advance the pagination watermark to the page's `nextCursor`/`hasMore`. Always
     * marks the list [hasLoaded] — even an empty page proves the network has answered,
     * so the cold-start skeleton must stand down.
     */
    fun appended(page: StatusPage): StatusBarListState {
        val existing = statuses.mapTo(HashSet(statuses.size)) { it.id }
        val fresh = page.statuses.filter { it.id !in existing }
        return copy(
            statuses = statuses + fresh,
            cursor = page.nextCursor,
            hasMore = page.hasMore,
            hasLoaded = true,
        )
    }

    /**
     * Seed the bar from a cached [statuses] snapshot (cache-first cold paint). Marks the
     * list [hasLoaded] so the cold-start skeleton stands down and a re-entrant
     * [StatusesViewModel.loadInitial] is inert, but leaves the pagination watermark cold
     * (no [cursor]) — the cached head is served instantly and the background network
     * first page (folded via [appended]) re-establishes pagination and replaces the seed
     * with the authoritative list. Mirrors iOS seeding `statuses` from
     * `CacheCoordinator` before the network answers.
     */
    fun seeded(statuses: List<StatusEntry>): StatusBarListState =
        copy(statuses = statuses, cursor = null, hasMore = true, hasLoaded = true)

    /**
     * Optimistically hoist a just-created [entry] to the front, dropping any prior
     * entry carrying the same id so a re-insertion never doubles it. Mirrors iOS
     * `statuses.insert(entry, at: 0)`, made idempotent by the id de-dup. Marks the
     * list [hasLoaded] — a freshly published mood is real content.
     */
    fun created(entry: StatusEntry): StatusBarListState =
        copy(
            statuses = listOf(entry) + statuses.filterNot { it.id == entry.id },
            hasLoaded = true,
        )

    /**
     * Drop the status with [statusId] (optimistic removal). Inert — returns the same
     * instance — when no status carries that id, so a stray removal never churns state.
     */
    fun removed(statusId: String): StatusBarListState =
        if (statuses.none { it.id == statusId }) this
        else copy(statuses = statuses.filterNot { it.id == statusId })

    /**
     * Replace the status carrying [entry]'s id **in place**, preserving its position
     * (a realtime `status:updated` delta). Inert — returns the same instance — when no
     * status carries that id, so an update for a status not in this feed never churns
     * state nor smuggles a foreign entry in. Mirrors iOS `statuses[index] = entry`
     * guarded by `firstIndex(where:)`.
     */
    fun updated(entry: StatusEntry): StatusBarListState {
        val index = statuses.indexOfFirst { it.id == entry.id }
        if (index < 0) return this
        return copy(statuses = statuses.toMutableList().also { it[index] = entry })
    }

    /**
     * Optimistically bump the [emoji] reaction count on the status with [statusId] by
     * one (mirrors iOS `summary[emoji, default: 0] += 1`). Inert when no status carries
     * that id.
     */
    fun reacted(statusId: String, emoji: String): StatusBarListState {
        val index = statuses.indexOfFirst { it.id == statusId }
        if (index < 0) return this
        val entry = statuses[index]
        val summary = (entry.reactionSummary ?: emptyMap()).toMutableMap()
        summary[emoji] = (summary[emoji] ?: 0) + 1
        val next = statuses.toMutableList().also { it[index] = entry.copy(reactionSummary = summary) }
        return copy(statuses = next)
    }

    companion object {
        val Empty = StatusBarListState()
    }
}
