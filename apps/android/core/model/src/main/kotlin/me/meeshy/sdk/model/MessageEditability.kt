package me.meeshy.sdk.model

/**
 * Whether one of your own messages is still editable, mirroring iOS's two-hour
 * edit window (the conversation screen offers the edit action only while
 * `Date().timeIntervalSince(createdAt) < 2h`).
 *
 * A message is editable iff it is the current user's own message and strictly
 * less than [EDIT_WINDOW_MILLIS] have elapsed since it was created. Boundary
 * cases, matching iOS:
 * - a future-dated creation time (clock skew between client and server) is
 *   treated as just-created, so the message stays editable;
 * - an unknown creation time cannot be windowed, so the window is not enforced
 *   and an own message stays editable (iOS never has a null `createdAt`; on the
 *   wire the field is optional, and refusing to edit a message merely because
 *   the server omitted a timestamp would be a worse gap than a stale edit).
 *
 * Stateless and pure — the clock is passed in as [nowMillis].
 */
object MessageEditability {

    /** The edit window: two hours, at iOS parity. */
    const val EDIT_WINDOW_MILLIS: Long = 2L * 60 * 60 * 1000

    fun canEdit(
        isOwn: Boolean,
        createdAtMillis: Long?,
        nowMillis: Long,
        windowMillis: Long = EDIT_WINDOW_MILLIS,
    ): Boolean {
        if (!isOwn) return false
        if (createdAtMillis == null) return true
        return nowMillis - createdAtMillis < windowMillis
    }
}
