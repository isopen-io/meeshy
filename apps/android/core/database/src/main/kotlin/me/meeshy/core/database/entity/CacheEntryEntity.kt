package me.meeshy.core.database.entity

import androidx.room.Entity

/**
 * One row of a generic cached list (iOS `cache_entries`): the item [itemId] at [position] of the list
 * stored under ([namespace], [key]), with the SHA-256 [contentHash] of its [payload] so a rewrite can
 * skip what did not change. A new list resource needs a namespace, not a new table.
 *
 * Each ([namespace], [key]) also owns ONE metadata row ([META_ITEM_ID], position -1): its
 * [lastFetchedAt] is the freshness clock of the whole key, its [payload] the persisted pagination
 * cursor. That row is what lets a synced-but-empty list be told from a never-synced one.
 */
@Entity(
    tableName = "cache_entries",
    primaryKeys = ["namespace", "key", "itemId"],
)
public data class CacheEntryEntity(
    val namespace: String,
    val key: String,
    val itemId: String,
    val position: Int,
    val contentHash: String,
    val lastFetchedAt: Long,
    val payload: String,
) {
    public companion object {
        /** Item id of the per-key metadata row: no real item has an empty id. */
        public const val META_ITEM_ID: String = ""
        public const val META_POSITION: Int = -1
    }
}
