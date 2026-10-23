package me.meeshy.app.conversations

import me.meeshy.sdk.socket.SocketConnectionState

/**
 * The connection-health strip under the app bar — port of the iOS
 * connection banner (offline / disconnected / syncing / connected).
 * Reconnection always wins over sync: a stale revalidation behind a dead
 * socket would otherwise read as healthy activity.
 *
 * [connectionSettled] is false while the app is still making its FIRST connection
 * (no connection seen yet and the grace period not elapsed): the socket starts
 * DISCONNECTED, and announcing « offline » or « reconnecting » at every launch would
 * be a lie. [isSyncing] is a refresh the USER asked for — a silent background
 * revalidation never pushes a strip into the list (cache-first, parity iOS `SyncPill`).
 */
enum class ConnectionBanner { HIDDEN, SYNCING, RECONNECTING, OFFLINE }

fun bannerFor(
    connection: SocketConnectionState,
    isSyncing: Boolean,
    connectionSettled: Boolean,
): ConnectionBanner =
    when (connection) {
        SocketConnectionState.DISCONNECTED ->
            if (connectionSettled) ConnectionBanner.OFFLINE else ConnectionBanner.HIDDEN
        SocketConnectionState.CONNECTING ->
            if (connectionSettled) ConnectionBanner.RECONNECTING else ConnectionBanner.HIDDEN
        SocketConnectionState.CONNECTED ->
            if (isSyncing) ConnectionBanner.SYNCING else ConnectionBanner.HIDDEN
    }
