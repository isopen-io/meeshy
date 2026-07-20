package me.meeshy.app.chat

import me.meeshy.sdk.model.call.ActiveCallSession

/**
 * Pure decision: *when* the chat header offers a « Rejoindre » pill for a call
 * the local session lost but that is still live server-side (crash/relaunch
 * mid-call). Isolated from the Composable so both branches are unit-tested
 * (same discipline as `CallPillPresenter`).
 *
 * The pill is offered ONLY when the server reports an active call AND this
 * device isn't already engaged in one — a minimised/floating call while viewing
 * that conversation's chat must not also show « Rejoindre » for the call you're
 * already in. You can only be in one call at a time, so a single local-liveness
 * flag suffices (no per-callId comparison). Parité iOS reconciliation guard.
 */
object RejoinPillPolicy {
    fun shouldOffer(serverActiveCall: ActiveCallSession?, hasLocalLiveCall: Boolean): Boolean =
        serverActiveCall != null && !hasLocalLiveCall
}
