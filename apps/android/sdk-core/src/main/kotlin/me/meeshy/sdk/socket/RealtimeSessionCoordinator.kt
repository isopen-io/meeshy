package me.meeshy.sdk.socket

import javax.inject.Inject
import javax.inject.Singleton

/**
 * App-lifetime owner of the realtime socket's session binding: the single place
 * that turns "the user is (un)authenticated" into the socket connecting, every
 * feature manager attaching its listeners, and — on logout — the socket tearing
 * down.
 *
 * Before this, `SocketManager.connect()` and every `*.attach()` were dead code:
 * nothing bridged the auth session to the realtime layer, so no `call:*`,
 * `message:*` or social frame ever reached a `CallViewModel`/`ChatViewModel`.
 * [onAuthenticatedChanged] is that bridge — call it whenever the authenticated
 * state changes (app start with a restored token, login, logout).
 *
 * The *what* and *ordering* of side effects live in the pure
 * [RealtimeLifecyclePlan]; this class only holds the last-seen edge and dispatches
 * the plan's commands to the (stateful) SDK singletons. It is [Synchronized] so a
 * login racing an app-start restore can't double-connect.
 */
@Singleton
class RealtimeSessionCoordinator @Inject constructor(
    private val socketManager: SocketManager,
    private val messageSocketManager: MessageSocketManager,
    private val socialSocketManager: SocialSocketManager,
    private val callSignalManager: CallSignalManager,
) {
    private var lastAuthenticated = false

    @Synchronized
    fun onAuthenticatedChanged(isAuthenticated: Boolean) {
        val commands = RealtimeLifecyclePlan.commandsFor(lastAuthenticated, isAuthenticated)
        lastAuthenticated = isAuthenticated
        commands.forEach(::execute)
    }

    private fun execute(command: RealtimeCommand) {
        when (command) {
            RealtimeCommand.Connect -> socketManager.connect()
            RealtimeCommand.Attach -> attachAll()
            RealtimeCommand.Disconnect -> socketManager.disconnect()
        }
    }

    private fun attachAll() {
        messageSocketManager.attach()
        socialSocketManager.attach()
        callSignalManager.attach()
    }
}
