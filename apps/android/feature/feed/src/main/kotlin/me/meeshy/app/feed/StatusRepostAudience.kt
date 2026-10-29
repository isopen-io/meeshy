package me.meeshy.app.feed

/**
 * The audience law of a republication: **the same audience, or a narrower one, NEVER a wider one**.
 * Mirror of `allowedRepostVisibilities` (`packages/shared/utils/repost-audience.ts`) and of iOS
 * `StoryRepostAudience` — the gateway enforces it (403 `REPOST_AUDIENCE_WIDENING`,
 * `PostService.repostPost` / `createPost`); this only caps the picker so the author is never offered a
 * choice the server will refuse.
 *
 * The six audiences are not a total order (`COMMUNITY` and `FRIENDS` are incomparable), so the table
 * is deliberately conservative: from `PUBLIC` everything, from `PRIVATE` itself, from any other
 * audience itself and `PRIVATE`. `EXCEPT` / `ONLY` cannot be expressed by this composer (no user
 * picker), so they reduce to `PRIVATE`; an absent or unknown audience reads as the most restrictive
 * one, never as the backend's `PUBLIC` default.
 */
internal object StatusRepostAudience {

    /** The audiences a republisher may choose; the first is the widest, hence the initial one. */
    fun allowed(original: String?): List<StatusVisibility> {
        val source = StatusVisibility.entries.firstOrNull { it.wire == original?.uppercase() }
            ?: return listOf(StatusVisibility.PRIVATE)
        return when (source) {
            StatusVisibility.PUBLIC -> StatusVisibility.entries
            StatusVisibility.PRIVATE -> listOf(StatusVisibility.PRIVATE)
            else -> listOf(source, StatusVisibility.PRIVATE)
        }
    }
}
