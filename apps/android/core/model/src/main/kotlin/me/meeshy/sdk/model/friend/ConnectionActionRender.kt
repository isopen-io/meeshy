package me.meeshy.sdk.model.friend

/**
 * What the shared connection chip draws for a given relationship — the pure
 * decision table of the iOS `ConnectionActionView` (`body` switch). Kept
 * framework-free so the six renderings are proven off-device; the Compose chip
 * is a thin projection of this value.
 */
sealed interface ConnectionActionRender {
    /** Self (or no actionable relation): draw nothing. */
    data object Hidden : ConnectionActionRender

    /** Red read-only "Bloqué" badge. */
    data object BlockedBadge : ConnectionActionRender

    /** Green read-only "Contact" badge with a check mark. */
    data object ContactBadge : ConnectionActionRender

    /** Two round buttons: decline (red tint) and accept (white on green). */
    data class AcceptDecline(val requestId: String) : ConnectionActionRender

    /** Amber "En attente" capsule with a clock; tapping cancels the request. */
    data object PendingSent : ConnectionActionRender

    /** Accent-coloured "Ajouter" capsule. */
    data object Add : ConnectionActionRender

    /** Read-only badges draw no gesture target. */
    val isInteractive: Boolean
        get() = this is AcceptDecline || this is PendingSent || this is Add

    companion object {
        fun from(state: UserRelationshipState): ConnectionActionRender = when (state) {
            is UserRelationshipState.Current -> Hidden
            is UserRelationshipState.Blocked -> BlockedBadge
            is UserRelationshipState.Connected -> ContactBadge
            is UserRelationshipState.PendingReceived -> AcceptDecline(state.requestId)
            is UserRelationshipState.PendingSent -> PendingSent
            is UserRelationshipState.None -> Add
        }

        fun from(action: ConnectAction): ConnectionActionRender = when (action) {
            is ConnectAction.Hidden -> Hidden
            is ConnectAction.Blocked -> BlockedBadge
            is ConnectAction.Contact -> ContactBadge
            is ConnectAction.Accept -> AcceptDecline(action.requestId)
            is ConnectAction.Pending -> PendingSent
            is ConnectAction.Connect -> Add
        }
    }
}

/** Haptic the platform layer performs for a [ConnectionFeedback]. */
enum class ConnectionHaptic { Success, Medium, Error }

/**
 * Outcome of a connection gesture, surfaced as a toast plus a haptic. The
 * French wording of the iOS toasts lives in the localised resources of the
 * chip; this enum is the stable key between controller and presenter.
 */
enum class ConnectionFeedback(val isError: Boolean, val haptic: ConnectionHaptic) {
    RequestSent(false, ConnectionHaptic.Success),
    RequestSendFailed(true, ConnectionHaptic.Error),
    ConnectionAccepted(false, ConnectionHaptic.Success),
    AcceptFailed(true, ConnectionHaptic.Error),
    RequestDeclined(false, ConnectionHaptic.Medium),
    DeclineFailed(true, ConnectionHaptic.Error),
    RequestCancelled(false, ConnectionHaptic.Medium),
    CancelFailed(true, ConnectionHaptic.Error),
}
