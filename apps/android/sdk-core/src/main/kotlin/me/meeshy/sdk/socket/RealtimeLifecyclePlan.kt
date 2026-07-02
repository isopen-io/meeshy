package me.meeshy.sdk.socket

/** A single side effect the realtime layer must perform on a session transition. */
enum class RealtimeCommand {
    /** Open (or re-open) the Socket.IO connection so a fresh socket exists. */
    Connect,

    /** Register every feature socket manager's listeners on the live socket. */
    Attach,

    /** Tear the socket down (logout / account switch). */
    Disconnect,
}

/**
 * Pure decision for how the realtime socket layer reacts to a change in the
 * authenticated-session state.
 *
 * Owns two invariants so no caller re-derives them:
 *
 * - **Ordering.** Listeners may only register on a socket that already exists —
 *   [SocketManager.on] no-ops while `_socket` is `null`. So a sign-in yields
 *   [RealtimeCommand.Connect] *before* [RealtimeCommand.Attach], never the
 *   reverse.
 * - **Edge-only.** We act solely on a genuine authenticated ⇄ unauthenticated
 *   transition — never re-connecting an already-live session (which would
 *   double-register every listener on the same socket and duplicate every
 *   inbound event) nor re-disconnecting an already-dead one.
 *
 * Because a fresh [SocketManager.connect] mints a **new** socket each time,
 * [RealtimeCommand.Attach] is paired with **every** connect (not once ever): a
 * logout → login cycle re-attaches on the second connect so listeners are never
 * lost to the discarded socket.
 */
object RealtimeLifecyclePlan {
    fun commandsFor(wasAuthenticated: Boolean, isAuthenticated: Boolean): List<RealtimeCommand> = when {
        !wasAuthenticated && isAuthenticated -> listOf(RealtimeCommand.Connect, RealtimeCommand.Attach)
        wasAuthenticated && !isAuthenticated -> listOf(RealtimeCommand.Disconnect)
        else -> emptyList()
    }
}
