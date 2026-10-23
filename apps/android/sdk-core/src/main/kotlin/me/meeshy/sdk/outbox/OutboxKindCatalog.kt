package me.meeshy.sdk.outbox

/**
 * What the outbox knows about a kind beyond how to send it (mirrors iOS `OutboxKind`
 * `countsTowardSyncIndicator` / `isDiscardableWhenTerminal` / `rawValue`).
 *
 * @property diskValue the string persisted in `outbox.kind`. Append-only: renaming a kind is a
 *   data migration, so it is pinned by `OutboxKindDiskValuesLockTest`.
 * @property countsForSyncIndicator whether a queued row of this kind keeps the "Synchronisation…"
 *   indicator on. False for background reports nobody waits for (read receipts and, when they
 *   exist, story views, consumption and capture reports).
 * @property terminalDisposable whether an EXHAUSTED row of this kind may be garbage-collected
 *   without losing anything the user wrote. Defaults to KEPT: a kind born tomorrow is retained
 *   until someone decides otherwise — a kept row costs a line, a dropped one costs the user's work.
 */
public data class OutboxKindMeta(
    val diskValue: String,
    val countsForSyncIndicator: Boolean,
    val terminalDisposable: Boolean,
)

public object OutboxKindCatalog {

    public fun metaFor(kind: OutboxKind): OutboxKindMeta = OutboxKindMeta(
        diskValue = kind.name,
        countsForSyncIndicator = countsForSyncIndicator(kind),
        terminalDisposable = terminalDisposable(kind),
    )

    private fun countsForSyncIndicator(kind: OutboxKind): Boolean = when (kind) {
        OutboxKind.READ_RECEIPT -> false
        OutboxKind.SEND_MESSAGE,
        OutboxKind.EDIT_MESSAGE,
        OutboxKind.DELETE_MESSAGE,
        OutboxKind.ADD_REACTION,
        OutboxKind.REMOVE_REACTION,
        OutboxKind.MARK_UNREAD,
        OutboxKind.UPDATE_CONVERSATION_PREFS,
        OutboxKind.UPDATE_PROFILE,
        OutboxKind.UPDATE_SETTINGS,
        OutboxKind.UPDATE_PRIVACY_SETTINGS,
        OutboxKind.PUBLISH_STORY,
        OutboxKind.UPLOAD_MEDIA,
        OutboxKind.BLOCK_USER,
        OutboxKind.UNBLOCK_USER,
        OutboxKind.SEND_FRIEND_REQUEST,
        OutboxKind.PIN_MESSAGE,
        OutboxKind.UNPIN_MESSAGE,
        OutboxKind.LIKE_POST,
        OutboxKind.UNLIKE_POST,
        OutboxKind.BOOKMARK_POST,
        OutboxKind.UNBOOKMARK_POST,
        OutboxKind.RESPOND_FRIEND_REQUEST,
        -> true
    }

    private fun terminalDisposable(kind: OutboxKind): Boolean = when (kind) {
        OutboxKind.ADD_REACTION,
        OutboxKind.REMOVE_REACTION,
        OutboxKind.READ_RECEIPT,
        OutboxKind.MARK_UNREAD,
        OutboxKind.DELETE_MESSAGE,
        OutboxKind.BLOCK_USER,
        OutboxKind.UNBLOCK_USER,
        OutboxKind.SEND_FRIEND_REQUEST,
        OutboxKind.RESPOND_FRIEND_REQUEST,
        OutboxKind.PIN_MESSAGE,
        OutboxKind.UNPIN_MESSAGE,
        OutboxKind.LIKE_POST,
        OutboxKind.UNLIKE_POST,
        OutboxKind.BOOKMARK_POST,
        OutboxKind.UNBOOKMARK_POST,
        -> true
        OutboxKind.SEND_MESSAGE,
        OutboxKind.EDIT_MESSAGE,
        OutboxKind.UPDATE_CONVERSATION_PREFS,
        OutboxKind.UPDATE_PROFILE,
        OutboxKind.UPDATE_SETTINGS,
        OutboxKind.UPDATE_PRIVACY_SETTINGS,
        OutboxKind.PUBLISH_STORY,
        OutboxKind.UPLOAD_MEDIA,
        -> false
    }

    /** Disk values of the kinds that must NOT keep the sync indicator on — the DAO's exclusion list. */
    public val syncIndicatorExcludedDiskValues: List<String> = OutboxKind.entries
        .map(::metaFor)
        .filterNot { it.countsForSyncIndicator }
        .map { it.diskValue }

    /** Disk values of the kinds whose terminal rows are safe to garbage-collect. */
    public val terminalDisposableDiskValues: Set<String> = OutboxKind.entries
        .map(::metaFor)
        .filter { it.terminalDisposable }
        .map { it.diskValue }
        .toSet()

    /** The kind persisted as [diskValue], or `null` for a kind a newer build wrote. */
    public fun fromDiskValue(diskValue: String): OutboxKind? =
        OutboxKind.entries.firstOrNull { it.name == diskValue }
}
