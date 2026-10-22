package me.meeshy.sdk.cache

private const val MINUTE = 60_000L
private const val HOUR = 60 * MINUTE
private const val DAY = 24 * HOUR

// iOS `TimeInterval.months(n)` is n * 30 days and `.years(n)` n * 365 days: the same
// arithmetic here keeps every window of the table below equal to its iOS twin.
private const val MONTH = 30 * DAY
private const val YEAR = 365 * DAY

/**
 * Freshness and keep-alive windows for a cached resource (ARCHITECTURE.md §4), with the
 * same table as iOS `CachePolicy` (`Cache/CachePolicy.swift`): one source of numbers, so a
 * resource is fresh, stale or expired for exactly as long on both platforms.
 *
 * [freshForMillis]  — data within this age is [CacheResult.Fresh]; no revalidation. (iOS `staleTTL`.)
 * [keepForMillis]   — data between fresh and keep is [CacheResult.Stale]; served +
 *                     background revalidation. Beyond keep, revalidation is forced
 *                     as [CacheResult.Syncing]. (iOS `ttl`.)
 * [maxItemCount]    — cap on the items one entry may hold; `null` = unbounded. Metadata the
 *                     store enforces, not the loader.
 * [storageLocation] — where the entry lives: the database ([StorageLocation.Room]) or the
 *                     file cache with a byte budget ([StorageLocation.Disk]).
 *
 * The two-argument constructor every existing call site uses is unchanged: the last two
 * parameters default to "unbounded, in the database".
 */
data class CachePolicy(
    val freshForMillis: Long,
    val keepForMillis: Long,
    val maxItemCount: Int? = null,
    val storageLocation: StorageLocation = StorageLocation.Room,
) {
    init {
        require(freshForMillis >= 0) { "freshForMillis must be >= 0" }
        require(keepForMillis >= freshForMillis) { "keepForMillis must be >= freshForMillis" }
        require(maxItemCount == null || maxItemCount > 0) { "maxItemCount must be > 0 when set" }
    }

    /** Where a cache entry is stored. Mirrors iOS `CachePolicy.StorageLocation` (`.grdb` / `.disk`). */
    sealed interface StorageLocation {

        /** The Room database: structured entries, rows-and-items budget ([maxItemCount]). */
        data object Room : StorageLocation

        /** The file cache under [subdir], evicted least-recently-used past [maxBytes]. */
        data class Disk(val subdir: String, val maxBytes: Long) : StorageLocation {
            init {
                require(subdir.isNotBlank()) { "subdir must not be blank" }
                require(maxBytes > 0) { "maxBytes must be > 0" }
            }
        }
    }

    companion object {
        val Default = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = DAY,
        )

        // ── Database-backed resources (iOS `.grdb`) ────────────────────────────

        val Conversations = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = DAY,
        )

        // The window one conversation keeps: six months of retention, a short fresh window
        // so reopening a thread revalidates quickly, a 600-message cap per entry.
        val Messages = CachePolicy(
            freshForMillis = 2 * MINUTE,
            keepForMillis = 6 * MONTH,
            maxItemCount = 600,
        )

        // The index of media carriers of one conversation (gallery). No cap: it must hold the
        // WHOLE conversation, where `Messages` keeps a window. Same retention as messages.
        val ConversationMedia = CachePolicy(
            freshForMillis = 10 * MINUTE,
            keepForMillis = 6 * MONTH,
        )

        val Participants = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = DAY,
        )

        // Another user's profile: 30 days, prolonged at every visit; the short fresh window
        // revalidates silently after five minutes.
        val Profiles = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = 30 * DAY,
            maxItemCount = 100,
        )

        // Seven days of feed stay servable (and readable offline) with no new download of the
        // list payload; the five-minute fresh window keeps a quick reopen instant, beyond it the
        // cache is served at once and revalidated silently.
        val Feed = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = 7 * DAY,
            maxItemCount = 100,
        )

        val Comments = CachePolicy(
            freshForMillis = 2 * MINUTE,
            keepForMillis = HOUR,
            maxItemCount = 500,
        )

        // The tray carries, for every story, the translation of its content AND of each canvas
        // text: the costliest payload to rebuild. Kept 72 h so the next-day cold start paints it
        // at once; the purge of stories out of their visibility window does the rest.
        val Stories = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = 72 * HOUR,
        )

        // Mood statuses live ~24h and the bar shifts quickly as friends post, so it
        // is fresh only briefly (a return to the feed within the minute serves the
        // last bar with no revalidation) and kept for the mood lifetime so a warm
        // re-entry paints the last bar instantly while a background refresh reconciles
        // it — the Android analogue of iOS `CacheCoordinator.statuses`.
        val Statuses = CachePolicy(
            freshForMillis = MINUTE,
            keepForMillis = DAY,
        )

        val Notifications = CachePolicy(
            freshForMillis = 2 * MINUTE,
            keepForMillis = DAY,
            maxItemCount = 200,
        )

        // The call journal changes only when a call ends. Calls are immutable once terminal,
        // so a long window is safe; the five-minute fresh window keeps the Calls tab instant
        // on a cold start, and 300 entries cap the local mirror of the gateway's sliding window.
        val CallHistory = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = 30 * DAY,
            maxItemCount = 300,
        )

        val UserStats = CachePolicy(
            freshForMillis = 10 * MINUTE,
            keepForMillis = 6 * HOUR,
            maxItemCount = 10,
        )

        val LinksAndTokens = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = 12 * HOUR,
            maxItemCount = 100,
        )

        // Rarely changed (an explicit gesture) but read on every list or sheet open: a long
        // fresh window, and a ten-minute stale window guarantees a server-truth revalidate soon
        // after a session resumes.
        val Preferences = CachePolicy(
            freshForMillis = 10 * MINUTE,
            keepForMillis = DAY,
            maxItemCount = 500,
        )

        val Communities = CachePolicy(
            freshForMillis = 5 * MINUTE,
            keepForMillis = DAY,
            maxItemCount = 500,
        )

        // Local-only, never synced: "stale" has no meaning, so the fresh window equals the keep
        // window and every read is Fresh until the eviction horizon, which only bounds storage.
        val Drafts = CachePolicy(
            freshForMillis = 30 * DAY,
            keepForMillis = 30 * DAY,
            maxItemCount = 500,
        )

        // Local-only call transcripts, never sent to the server: 90 days, every read Fresh.
        val CallTranscripts = CachePolicy(
            freshForMillis = 90 * DAY,
            keepForMillis = 90 * DAY,
            maxItemCount = 1000,
        )

        // The network and quality journal of each call, on this device only: 30 days, 200 calls.
        val CallNetworkJournals = CachePolicy(
            freshForMillis = 30 * DAY,
            keepForMillis = 30 * DAY,
            maxItemCount = 200,
        )

        // The empty-query "discover people" suggestions shift as the social graph
        // does but not by the second; fresh for a minute so a return to the tab
        // paints instantly, kept a few hours so a cold revisit still shows the last
        // list while it revalidates. (No iOS twin.)
        val Suggestions = CachePolicy(
            freshForMillis = MINUTE,
            keepForMillis = 6 * HOUR,
        )

        // ── File-cache media (iOS `.disk`): no stale window, fresh until the TTL ──

        val MediaImages = CachePolicy(
            freshForMillis = YEAR,
            keepForMillis = YEAR,
            storageLocation = StorageLocation.Disk(subdir = "Images", maxBytes = 300_000_000L),
        )

        val MediaAudio = CachePolicy(
            freshForMillis = 6 * MONTH,
            keepForMillis = 6 * MONTH,
            storageLocation = StorageLocation.Disk(subdir = "Audio", maxBytes = 200_000_000L),
        )

        // 1 GB: a single video story weighs ~275 MB, and at 500 MB two stories were enough to
        // evict the unpinned reels and conversation videos (hence re-download them).
        val MediaVideo = CachePolicy(
            freshForMillis = 6 * MONTH,
            keepForMillis = 6 * MONTH,
            storageLocation = StorageLocation.Disk(subdir = "Video", maxBytes = 1_000_000_000L),
        )

        // A thumbnail is immutable at a stable URL: six months like the media it previews, and a
        // 150 MB budget so the LRU, not the TTL, is the limiting factor.
        val Thumbnails = CachePolicy(
            freshForMillis = 6 * MONTH,
            keepForMillis = 6 * MONTH,
            storageLocation = StorageLocation.Disk(subdir = "Thumbnails", maxBytes = 150_000_000L),
        )
    }
}
