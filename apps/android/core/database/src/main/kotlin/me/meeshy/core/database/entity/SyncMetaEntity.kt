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
 *
 * [etag] is the response's own `ETag` header (RFC 7232) from the last time
 * this resource's request was proven complete-in-one-shot — #5188. It is
 * reused as `If-None-Match`; a matching 304 means "confirmed unchanged" and
 * skips both the body decode AND every Room write, INCLUDING
 * [contentWatermarkMillis] (a 304 proves "nothing new", never "I have seen
 * everything up to now" — only a decoded, exhaustive sweep may advance that).
 *
 * [etagRequestKey] exists because an `ETag` hashes the FULL response body of
 * ONE SPECIFIC request shape (`sendWithETag`,
 * `services/gateway/src/routes/conversations/core-list.ts:892-906`) — a
 * validator captured for a DELTA page (`updatedSince=<watermark>`) does not
 * apply to a FULL sweep (`updatedSince` absent), or to a delta at a
 * DIFFERENT watermark. It records the exact `updatedSince` value (or a
 * sentinel for "no `updatedSince`") [etag] was captured under, so a caller
 * only ever sends `If-None-Match` when replaying that EXACT request. Unused
 * by resources with a single, unvarying request shape (e.g. a conversation's
 * message window, `me.meeshy.sdk.conversation.MessageCacheSource`) — always
 * `null` there.
 */
@Entity(tableName = "sync_meta")
public data class SyncMetaEntity(
    @PrimaryKey val resourceKey: String,
    val lastSyncedAt: Long,
    val contentWatermarkMillis: Long? = null,
    val etag: String? = null,
    val etagRequestKey: String? = null,
)
