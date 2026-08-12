package me.meeshy.sdk.model

/**
 * Whether one of your own messages can still be deleted **for everyone**,
 * mirroring iOS's two-hour window (`ConversationCommandHandler.canDeleteForEveryone`:
 * `guard message.isMe else { return false }; return Date().timeIntervalSince(createdAt) <= window`).
 *
 * "Delete for everyone" is a server round-trip that removes the message for all
 * participants and is only offered for your own message within the window. Past
 * the window (or for someone else's message) only the local-only "delete for me"
 * remains — see [me.meeshy.sdk.chat.LocallyHiddenMessages].
 *
 * Boundary cases, matching iOS:
 * - the window is **inclusive** (`<=`), unlike the exclusive `<` edit window in
 *   [MessageEditability], so the exact boundary instant is still deletable;
 * - a future-dated creation time (client/server clock skew) is treated as
 *   just-created, so the message stays deletable;
 * - an unknown creation time cannot be windowed, so the window is not enforced
 *   and an own message stays deletable-for-everyone; the server enforces its own
 *   window regardless, and refusing merely because the wire omitted a timestamp
 *   would be a worse gap.
 *
 * Stateless and pure — the clock is passed in as [nowMillis].
 */
object MessageDeletability {

    /** The delete-for-everyone window: two hours, at iOS parity. */
    const val DELETE_FOR_EVERYONE_WINDOW_MILLIS: Long = 2L * 60 * 60 * 1000

    fun canDeleteForEveryone(
        isOwn: Boolean,
        createdAtMillis: Long?,
        nowMillis: Long,
        windowMillis: Long = DELETE_FOR_EVERYONE_WINDOW_MILLIS,
    ): Boolean {
        if (!isOwn) return false
        if (createdAtMillis == null) return true
        return nowMillis - createdAtMillis <= windowMillis
    }
}
