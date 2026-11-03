package me.meeshy.sdk.model.socket

/**
 * Une coupure décidée par le SERVEUR se rattrape ; une coupure décidée par l'app, non (miroir de
 * `SocketDisconnectPolicy.swift`). Quand la passerelle ferme elle-même la connexion, Socket.IO ne relance rien :
 * c'est à l'app de réarmer l'échelle. Les fermetures que l'app provoque (déconnexion, mise en arrière-plan) ne
 * relancent jamais — ce serait rouvrir ce qu'elle vient de fermer exprès.
 */
public object SocketDisconnectPolicy {
    /** « Got Disconnect » (iOS) et son équivalent du client Java : la passerelle a fermé la connexion. */
    private const val SERVER_CLOSED_IOS = "Got Disconnect"
    private const val SERVER_CLOSED_JAVA = "io server disconnect"
    private const val RECONNECT_FAILED = "Reconnect Failed"

    public fun retries(afterReason: String?): Boolean =
        afterReason == SERVER_CLOSED_IOS || afterReason == SERVER_CLOSED_JAVA || afterReason == RECONNECT_FAILED
}
