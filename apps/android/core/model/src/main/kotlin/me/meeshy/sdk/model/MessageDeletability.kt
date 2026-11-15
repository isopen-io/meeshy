package me.meeshy.sdk.model

/**
 * Whether a message can be deleted **for everyone** by its author — the shared action law
 * (`messageActionsFor`, mirrored by [MessageActionPolicy.Verdicts.deleteForEveryone]) follows
 * `admitMessageDelete`: **the author deletes for everyone without any window**. Someone else's
 * message is never deleted for everyone: a privileged third party REMOVES it (with a reason, never
 * in a direct — [MessageActionPolicy.Verdicts.remove]).
 *
 * A caller may still pass a [windowMillis] to bound it (inclusive); by default there is none.
 * An unknown creation time cannot be windowed, so an own message stays deletable.
 *
 * Stateless and pure — the clock is passed in as [nowMillis].
 */
object MessageDeletability {

    fun canDeleteForEveryone(
        isOwn: Boolean,
        createdAtMillis: Long?,
        nowMillis: Long,
        windowMillis: Long? = null,
    ): Boolean {
        if (!isOwn) return false
        if (windowMillis == null || createdAtMillis == null) return true
        return nowMillis - createdAtMillis <= windowMillis
    }
}
