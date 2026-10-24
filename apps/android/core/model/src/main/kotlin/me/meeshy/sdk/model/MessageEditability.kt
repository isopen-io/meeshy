package me.meeshy.sdk.model

/**
 * Whether a message is still editable by the reader — the author's window of the shared action law
 * (`messageActionsFor`, `packages/shared/utils/message-action-policy.ts`; mirrored by
 * [MessageActionPolicy.Verdicts.edit]): **24 hours, bounds included**, as `messageEditAdmission.ts`
 * enforces it.
 *
 * - the author edits while `now - createdAt <= 24 h` (the exact boundary instant is still editable);
 * - a platform MODERATOR, ADMIN or BIGBOSS (compared EXACTLY, see [PlatformRole.exact]) who is an
 *   active member edits past the window and on someone else's message ([moderatesPlatform]);
 * - a future-dated creation time (clock skew) is treated as just-created;
 * - an unknown creation time cannot be windowed, so an own message stays editable (the law returns
 *   an edit verdict with no `windowEndsAt`).
 *
 * The full verdict (E2EE, view-once, kind, closed conversation, minor in Global) is
 * [MessageActionPolicy.actionsFor] ; this helper only answers the window and rank question for call
 * sites that already know the rest. Stateless and pure — the clock is passed in as [nowMillis].
 */
object MessageEditability {

    /** The author's edit window: 24 hours, at parity with the shared law. */
    const val EDIT_WINDOW_MILLIS: Long = MessageActionPolicy.EDIT_WINDOW_MILLIS

    fun canEdit(
        isOwn: Boolean,
        createdAtMillis: Long?,
        nowMillis: Long,
        windowMillis: Long = EDIT_WINDOW_MILLIS,
        moderatesPlatform: Boolean = false,
    ): Boolean {
        if (!isOwn) return moderatesPlatform
        if (createdAtMillis == null) return true
        return nowMillis - createdAtMillis <= windowMillis || moderatesPlatform
    }

    /** The instant the author's window closes, or `null` when it cannot be windowed. */
    fun windowEndsAtMillis(createdAtMillis: Long?, windowMillis: Long = EDIT_WINDOW_MILLIS): Long? =
        createdAtMillis?.let { it + windowMillis }
}
