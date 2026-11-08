package me.meeshy.core.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached call-journal row (ARCHITECTURE.md §4; ADR-004 — Room is the SoT).
 *
 * The call history is cached as a serialized [me.meeshy.sdk.model.call.CallRecord]
 * payload plus the columns needed to order the list (`startedAt`, epoch-millis
 * parsed from the record's ISO-8601 instant) and age the cache (`cachedAt`).
 * Genuinely cache-first: the recent/missed-calls list paints from these rows
 * before any network call and survives process death — surpassing an in-memory
 * cache that empties on every cold start.
 *
 * `participants` (JSON array) and `reactionCounts` (JSON object) are the journal row's people and
 * reactions, kept as columns so a row paints complete before any network call (version 27). Both
 * default to empty: rows cached by an older build, or served by an older gateway, stay valid.
 */
@Entity(tableName = "call_history")
public data class CallHistoryEntity(
    @PrimaryKey val callId: String,
    val payload: String,
    val startedAt: Long,
    val cachedAt: Long,
    @ColumnInfo(defaultValue = "'[]'") val participants: String = "[]",
    @ColumnInfo(defaultValue = "'{}'") val reactionCounts: String = "{}",
)
