package me.meeshy.sdk.model.cache

import java.security.MessageDigest

/** An item about to be written: its identity and the SHA-256 of its serialized payload. */
public data class CacheIncoming(val itemId: String, val contentHash: String)

/** A row already on disk for the key, as the diff needs to see it. */
public data class CacheStoredRow(val itemId: String, val position: Int, val contentHash: String?)

/** A row whose payload is new or changed: it is written whole at [position]. */
public data class CacheUpsert(val itemId: String, val position: Int, val contentHash: String)

/** A row whose payload is unchanged but whose rank in the list moved: only its position is rewritten. */
public data class CacheMove(val itemId: String, val position: Int)

/**
 * What a write must do to bring the disk to the new list — the pure heart of the differential
 * write (iOS `GRDBCacheL2.upsertEntriesDiffed`): rows that left the list are deleted, rows with an
 * unchanged hash are skipped, only the rest is written. Cost is proportional to the CHANGE.
 */
public data class CacheDiffPlan(
    val deletes: List<String>,
    val upserts: List<CacheUpsert>,
    val moves: List<CacheMove>,
    val unchanged: Int,
) {
    /** True when the disk already holds exactly this list: the write touches no row. */
    public val isNoOp: Boolean get() = deletes.isEmpty() && upserts.isEmpty() && moves.isEmpty()
}

public object CacheDiff {

    /**
     * The list that is actually stored: duplicates dropped (first occurrence wins, a primary key
     * is unique) and truncated to the LAST [maxItemCount] — the oldest are the head of a list
     * kept oldest-first, exactly like iOS `items.suffix(max)`.
     */
    public fun <T> bounded(items: List<T>, id: (T) -> String, maxItemCount: Int?): List<T> {
        val unique = items.distinctBy(id)
        return if (maxItemCount != null && unique.size > maxItemCount) unique.takeLast(maxItemCount) else unique
    }

    public fun plan(existing: List<CacheStoredRow>, incoming: List<CacheIncoming>): CacheDiffPlan {
        val byId = existing.associateBy { it.itemId }
        val keptIds = incoming.mapTo(HashSet()) { it.itemId }
        val deletes = existing.map { it.itemId }.filterNot { it in keptIds }
        val upserts = ArrayList<CacheUpsert>()
        val moves = ArrayList<CacheMove>()
        var unchanged = 0
        incoming.forEachIndexed { index, item ->
            val stored = byId[item.itemId]
            when {
                stored == null || stored.contentHash != item.contentHash ->
                    upserts += CacheUpsert(item.itemId, index, item.contentHash)
                stored.position != index -> moves += CacheMove(item.itemId, index)
                else -> unchanged++
            }
        }
        return CacheDiffPlan(deletes, upserts, moves, unchanged)
    }

    /** Lower-case hex SHA-256 of [payload] (UTF-8): the change fingerprint stored beside each row. */
    public fun contentHash(payload: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(payload.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
