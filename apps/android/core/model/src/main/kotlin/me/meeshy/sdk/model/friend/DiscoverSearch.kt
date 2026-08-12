package me.meeshy.sdk.model.friend

/**
 * What a raw Discover search field value resolves to. Port of the iOS
 * `DiscoverViewModel.performSearch` guard (`query.count >= 2`): the empty-query
 * suggestions surface is a distinct path, so a sub-threshold query simply clears
 * the results rather than hitting the network.
 */
sealed interface DiscoverSearchAction {
    /** The (trimmed) query is too short — show nothing, cancel any in-flight search. */
    data object Clear : DiscoverSearchAction

    /** The query is long enough — search the network for [query] (already trimmed). */
    data class Search(val query: String) : DiscoverSearchAction
}

/**
 * The pure SSOT that turns a raw search field value into a [DiscoverSearchAction].
 * Framework-agnostic and total so the "when do we actually search?" rule is unit
 * tested once and reused by the `DiscoverViewModel` (no re-implementation in the
 * Composable's `onValueChange`).
 */
object DiscoverSearch {
    /** Minimum trimmed length before a network search fires (parity with iOS). */
    const val MIN_QUERY_LENGTH: Int = 2

    fun action(rawQuery: String): DiscoverSearchAction {
        val trimmed = rawQuery.trim()
        return if (trimmed.length < MIN_QUERY_LENGTH) {
            DiscoverSearchAction.Clear
        } else {
            DiscoverSearchAction.Search(trimmed)
        }
    }
}

/**
 * The inline "connect" control a Discover / profile row shows for another user,
 * derived purely from their [UserRelationshipState]. Port of the iOS
 * `ConnectionActionView` state switch — the single button-decision SSOT so every
 * surface renders the same control without re-reading the resolver by hand.
 */
sealed interface ConnectAction {
    /** The row is the current user — render no action at all (iOS `.current` → `EmptyView`). */
    data object Hidden : ConnectAction

    /** No relationship — offer to send a friend request (iOS `.none` → add button). */
    data object Connect : ConnectAction

    /** A request the current user already sent is still pending (iOS `.pendingSent`). */
    data object Pending : ConnectAction

    /** A request the current user received — offer to accept it (iOS `.pendingReceived`). */
    data class Accept(val requestId: String) : ConnectAction

    /** Already an accepted friend (iOS `.connected` → "Contact" badge). */
    data object Contact : ConnectAction

    /** The current user has blocked this user (iOS `.blocked` → "Bloqué" badge). */
    data object Blocked : ConnectAction

    companion object {
        fun from(state: UserRelationshipState): ConnectAction = when (state) {
            is UserRelationshipState.Current -> Hidden
            is UserRelationshipState.Blocked -> Blocked
            is UserRelationshipState.Connected -> Contact
            is UserRelationshipState.PendingSent -> Pending
            is UserRelationshipState.PendingReceived -> Accept(state.requestId)
            is UserRelationshipState.None -> Connect
        }
    }
}
