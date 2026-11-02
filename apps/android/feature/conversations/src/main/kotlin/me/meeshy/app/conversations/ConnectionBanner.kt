package me.meeshy.app.conversations

import me.meeshy.sdk.socket.SocketConnectionState

/**
 * The connection-health strip under the app bar — port of the iOS `ConnectionBanner`
 * rotation (`apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift`), in its
 * priority order: the DEVICE has no network ⇒ [OFFLINE] (whatever the socket believes);
 * the network is back after a down state the user SAW ⇒ [BACK_ONLINE] for a few seconds;
 * the socket is awaited while the network is there ⇒ [CONNECTING] for a socket that never
 * connected, [RECONNECTING] for one that dropped (iOS #10923: the label follows the
 * status); a refresh the user asked for ⇒ [SYNCING].
 *
 * A waited socket is only announced once its grace window is over ([connectionSettled]):
 * the first connection of a launch, and every quick reconnection, stay invisible.
 */
enum class ConnectionBanner { HIDDEN, SYNCING, CONNECTING, RECONNECTING, OFFLINE, BACK_ONLINE }

/** The visible down states — the ones whose end deserves the « online » confirmation. */
val ConnectionBanner.isDown: Boolean
    get() = this == ConnectionBanner.OFFLINE ||
        this == ConnectionBanner.CONNECTING ||
        this == ConnectionBanner.RECONNECTING

fun bannerFor(
    connection: SocketConnectionState,
    isSyncing: Boolean,
    connectionSettled: Boolean,
    isNetworkOnline: Boolean = true,
    hasConnected: Boolean = false,
    showBackOnline: Boolean = false,
): ConnectionBanner = when {
    !isNetworkOnline -> ConnectionBanner.OFFLINE
    connection != SocketConnectionState.CONNECTED -> when {
        !connectionSettled -> ConnectionBanner.HIDDEN
        hasConnected -> ConnectionBanner.RECONNECTING
        else -> ConnectionBanner.CONNECTING
    }
    showBackOnline -> ConnectionBanner.BACK_ONLINE
    isSyncing -> ConnectionBanner.SYNCING
    else -> ConnectionBanner.HIDDEN
}
