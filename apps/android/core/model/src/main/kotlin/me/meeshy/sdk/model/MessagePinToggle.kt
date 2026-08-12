package me.meeshy.sdk.model

/**
 * The pin action available for a message in the long-press sheet, mirroring iOS
 * `ConversationViewModel.togglePin` + `ContextAction.pin(isActive:)`:
 *  - a not-yet-pinned live message can be **pinned**;
 *  - an already-pinned live message can be **unpinned** (the same toggle);
 *  - a deleted message (a tombstone) exposes no pin action at all.
 */
sealed interface PinAction {
    data object Pin : PinAction
    data object Unpin : PinAction
    data object Unavailable : PinAction
}

/**
 * Pure SSOT for the message pin toggle. A message is *pinned* when its
 * `pinnedAt` instant is present and non-blank — the same rule the pinned-banner
 * reads (`PinnedMessages`), so the toggle and the banner can never disagree
 * about what "pinned" means.
 *
 * Pinning is **not** owner-restricted and has **no** time window (parity with
 * the gateway, which only checks conversation access — unlike edit/delete which
 * gate on authorship and a two-hour window), so the sole gate is that a deleted
 * message can never be pinned.
 *
 * Stateless and pure — no clock, no session.
 */
object MessagePinToggle {

    /** A message counts as pinned iff its `pinnedAt` instant is present and non-blank. */
    fun isPinned(pinnedAtIso: String?): Boolean = !pinnedAtIso.isNullOrBlank()

    fun resolve(isDeleted: Boolean, pinnedAtIso: String?): PinAction = when {
        isDeleted -> PinAction.Unavailable
        isPinned(pinnedAtIso) -> PinAction.Unpin
        else -> PinAction.Pin
    }
}
