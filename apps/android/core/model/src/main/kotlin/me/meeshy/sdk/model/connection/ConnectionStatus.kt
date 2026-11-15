package me.meeshy.sdk.model.connection

/**
 * Le résumé de santé de la connexion que toute surface lit (miroir d'iOS `ConnectionStatusViewModel.Status`) :
 * le réseau de l'appareil, la socket et la file d'écritures de l'outbox, agrégés UNE seule fois pour que la bannière,
 * la pastille et le reste n'observent pas trois sources qui divergent.
 */
enum class ConnectionStatus {
    /** Connecté, file vide. */
    CONNECTED,

    /** Connecté, mais la file garde des écritures en attente. */
    SYNCING,

    /** Réseau présent, socket JAMAIS connectée encore : une première connexion, pas une reconnexion (iOS #10923). */
    CONNECTING,

    /** Réseau présent, mais une socket qui était connectée a chuté. */
    DISCONNECTED,

    /** Aucun réseau sur l'appareil, quoi que la socket croie. */
    OFFLINE,
    ;

    /** Les états dégradés : ceux dont la fin mérite la confirmation « En ligne ». */
    val isDegraded: Boolean get() = this == OFFLINE || this == CONNECTING || this == DISCONNECTED

    companion object {
        /** Priorité : offline > connecting > disconnected > syncing > connected. */
        fun derive(online: Boolean, connected: Boolean, pending: Int, hadConnected: Boolean): ConnectionStatus = when {
            !online -> OFFLINE
            !connected -> if (hadConnected) DISCONNECTED else CONNECTING
            pending > 0 -> SYNCING
            else -> CONNECTED
        }
    }
}
