package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Per-resource sync metadata — the `lastSyncedAt` that drives SWR freshness
 * ([me.meeshy.core.database.dao.SyncMetaDao]; ARCHITECTURE.md §4, §6).
 *
 * Keeping sync time separate from the data lets a successful revalidation
 * refresh freshness without rewriting unchanged rows.
 */
@Entity(tableName = "sync_meta")
public data class SyncMetaEntity(
    @PrimaryKey val resourceKey: String,
    val lastSyncedAt: Long,
)
