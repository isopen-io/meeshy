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
        OutboxKind.READ_RECEIPT,
        OutboxKind.REPORT_ATTACHMENT_STATUS,
        OutboxKind.CONSUME_AFTER_READ,
        OutboxKind.CONSUME_VIEW_ONCE,
        OutboxKind.MARK_RECEIVED,
        OutboxKind.MARK_STORY_VIEWED,
        OutboxKind.REPORT_CONTENT_CAPTURE,
        -> false
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
        OutboxKind.UPDATE_AUDIO_SETTINGS,
        OutboxKind.UPDATE_APPLICATION_SETTINGS,
        OutboxKind.UPDATE_PREFERENCE_CATEGORY,
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
        OutboxKind.CREATE_POST,
        OutboxKind.CREATE_COMMENT,
        OutboxKind.SEND_E2EE_MESSAGE,
        OutboxKind.REPOST_POST,
        OutboxKind.CREATE_CONVERSATION,
        OutboxKind.UPDATE_CONVERSATION,
        OutboxKind.SETTINGS_ACTION,
        OutboxKind.REACT_STORY,
        OutboxKind.HIDE_FOR_ME,
        OutboxKind.RESTORE_FOR_ME,
        OutboxKind.REMOVE_ATTACHMENT,
        OutboxKind.MODERATION_DELETE,
        OutboxKind.REPOST_STORY,
        OutboxKind.DELETE_COMMENT,
        OutboxKind.TOGGLE_LIKE_COMMENT,
        OutboxKind.LEAVE_CONVERSATION,
        OutboxKind.DELETE_CONVERSATION_FOR_ME,
        OutboxKind.DELETE_CONVERSATION_FOR_ALL,
        -> true
    }

    private fun terminalDisposable(kind: OutboxKind): Boolean = when (kind) {
        OutboxKind.ADD_REACTION,
        OutboxKind.REMOVE_REACTION,
        OutboxKind.READ_RECEIPT,
        OutboxKind.REPORT_ATTACHMENT_STATUS,
        OutboxKind.CONSUME_AFTER_READ,
        OutboxKind.CONSUME_VIEW_ONCE,
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
        OutboxKind.REACT_STORY,
        OutboxKind.HIDE_FOR_ME,
        OutboxKind.RESTORE_FOR_ME,
        OutboxKind.MARK_RECEIVED,
        OutboxKind.MARK_STORY_VIEWED,
        OutboxKind.DELETE_COMMENT,
        OutboxKind.TOGGLE_LIKE_COMMENT,
        OutboxKind.LEAVE_CONVERSATION,
        OutboxKind.DELETE_CONVERSATION_FOR_ME,
        OutboxKind.DELETE_CONVERSATION_FOR_ALL,
        OutboxKind.REPORT_CONTENT_CAPTURE,
        -> true
        OutboxKind.REPOST_STORY,
        OutboxKind.REMOVE_ATTACHMENT,
        OutboxKind.MODERATION_DELETE,
        OutboxKind.SEND_MESSAGE,
        OutboxKind.SEND_E2EE_MESSAGE,
        OutboxKind.EDIT_MESSAGE,
        OutboxKind.UPDATE_CONVERSATION_PREFS,
        OutboxKind.UPDATE_PROFILE,
        OutboxKind.UPDATE_SETTINGS,
        OutboxKind.UPDATE_PRIVACY_SETTINGS,
        OutboxKind.UPDATE_AUDIO_SETTINGS,
        OutboxKind.UPDATE_APPLICATION_SETTINGS,
        OutboxKind.UPDATE_PREFERENCE_CATEGORY,
        OutboxKind.PUBLISH_STORY,
        OutboxKind.UPLOAD_MEDIA,
        OutboxKind.CREATE_POST,
        OutboxKind.CREATE_COMMENT,
        OutboxKind.REPOST_POST,
        OutboxKind.CREATE_CONVERSATION,
        OutboxKind.UPDATE_CONVERSATION,
        OutboxKind.SETTINGS_ACTION,
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
