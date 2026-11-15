package me.meeshy.core.database.entity

import androidx.room.Entity

/**
 * One JSON document cached under ([namespace], [key]) with the instant it was fetched — for a
 * resource that is a single object or a small list read whole (community:list, participants:<convId>),
 * where the per-item rows of [CacheEntryEntity] buy nothing.
 */
@Entity(
    tableName = "keyed_json_cache",
    primaryKeys = ["namespace", "key"],
)
public data class KeyedJsonCacheEntity(
    val namespace: String,
    val key: String,
    val payload: String,
    val fetchedAt: Long,
)
