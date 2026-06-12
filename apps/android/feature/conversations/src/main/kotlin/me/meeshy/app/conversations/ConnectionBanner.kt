package me.meeshy.app.conversations

import me.meeshy.sdk.socket.SocketConnectionState

/**
 * The connection-health strip under the app bar — port of the iOS
 * connection banner (offline / disconnected / syncing / connected).
 * Reconnection always wins over sync: a stale revalidation behind a dead
 * socket would otherwise read as healthy activity.
 */
enum class ConnectionBanner { HIDDEN, SYNCING, RECONNECTING, OFFLINE }

fun bannerFor(connection: SocketConnectionState, isSyncing: Boolean): ConnectionBanner =
    when (connection) {
        SocketConnectionState.DISCONNECTED -> ConnectionBanner.OFFLINE
        SocketConnectionState.CONNECTING -> ConnectionBanner.RECONNECTING
        SocketConnectionState.CONNECTED ->
            if (isSyncing) ConnectionBanner.SYNCING else ConnectionBanner.HIDDEN
    }
