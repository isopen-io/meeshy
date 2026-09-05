package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Per-resource sync metadata — the `lastSyncedAt` that drives SWR freshness
 * ([me.meeshy.core.database.dao.SyncMetaDao]; ARCHITECTURE.md §4, §6).
 *
 * Keeping sync time separate from the data lets a successful revalidation
 * refresh freshness without rewriting unchanged rows.
 *
 * [contentWatermarkMillis] is a SECOND, independent clock (#5187) — the max
 * `updatedAt` (epoch millis, gateway field) seen across an EXHAUSTIVE sweep of
 * this resource, never the device clock. It drives delta-sync eligibility
 * ([me.meeshy.sdk.conversation.ConversationCacheSource]): a resource whose
 * watermark is set and recent enough asks the server for `updatedSince`
 * that watermark instead of re-fetching everything. `null` means "no proven
 * baseline yet" — always resolves to a full sweep. It only ever advances from
 * data the server actually returned (`gt`-filtered against this same field
 * server-side), and only when a sweep proved itself exhaustive — never from
 * [lastSyncedAt], which merely says "we tried," not "we saw everything up to
 * here."
 */
@Entity(tableName = "sync_meta")
public data class SyncMetaEntity(
    @PrimaryKey val resourceKey: String,
    val lastSyncedAt: Long,
    val contentWatermarkMillis: Long? = null,
)
