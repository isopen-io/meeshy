package me.meeshy.sdk.friend

import me.meeshy.sdk.net.NetworkResult

/** One page of a cursor-paginated read, reduced to what a drain loop needs. */
internal data class DrainedPage<T>(
    val items: List<T>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/**
 * Reads a cursor-paginated list to exhaustion, bounded — the one loop behind the friend
 * list (`direction=any&status=accepted`) and the blocklist, so the two cannot drift.
 *
 * It stops, in this order of precedence, when:
 * - a page FAILS — the whole read fails with it. A list cut off mid-way and presented
 *   as complete is worse than an error: the Contacts tab would lose friends and the
 *   [BlockCache] would forget blocked people, with nothing on screen saying so;
 * - the gateway says there is nothing more ([DrainedPage.hasMore] false);
 * - a page comes back empty;
 * - no cursor is given — asking the same page again would loop until [cap], collecting
 *   duplicates;
 * - the cursor did not advance, for the same reason;
 * - [cap] rows are held. The cap is a safety bound against a `hasMore` that would never
 *   fall, not a page budget: it returns what was read, as the iOS reader does.
 */
internal suspend fun <T> drainByCursor(
    cap: Int,
    fetch: suspend (cursor: String?) -> NetworkResult<DrainedPage<T>>,
): NetworkResult<List<T>> {
    val collected = ArrayList<T>()
    var cursor: String? = null
    while (collected.size < cap) {
        val page = when (val result = fetch(cursor)) {
            is NetworkResult.Failure -> return result
            is NetworkResult.Success -> result.data
        }
        collected += page.items
        val next = page.nextCursor?.takeIf { it.isNotBlank() }
        if (!page.hasMore || page.items.isEmpty() || next == null || next == cursor) break
        cursor = next
    }
    return NetworkResult.Success(if (collected.size > cap) collected.take(cap) else collected)
}
