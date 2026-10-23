package me.meeshy.sdk.model.socket

import me.meeshy.sdk.model.auth.JwtExpiry

/**
 * Ce que le gestionnaire de socket doit faire AVANT d'ouvrir une connexion — miroir de
 * `MessageSocketManager.establishTransport` (iOS) : un JWT échu (à 30 s près) n'ouvre PAS
 * de socket, le renouvellement part d'abord, puis la connexion repart avec le jeton frais.
 */
public sealed interface SocketConnectDecision {
    /** Aucun justificatif : rien à ouvrir. */
    public data object NoCredentials : SocketConnectDecision

    /** Le JWT détenu est échu : renouveler en SON nom, puis reprendre la connexion. */
    public data class RefreshFirst(val presentedJwt: String) : SocketConnectDecision

    /** Un compte inscrit : le [jwt] est valide, présenté au handshake. */
    public data class ConnectRegistered(val jwt: String, val sessionToken: String?) : SocketConnectDecision

    /** Un invité de lien : seul son jeton de session voyage. */
    public data class ConnectGuest(val sessionToken: String) : SocketConnectDecision

    public companion object {
        public fun decide(jwt: String?, sessionToken: String?, nowEpochSeconds: Double): SocketConnectDecision =
            when {
                !jwt.isNullOrBlank() ->
                    if (JwtExpiry.isExpired(jwt, nowEpochSeconds)) {
                        RefreshFirst(jwt)
                    } else {
                        ConnectRegistered(jwt, sessionToken?.takeIf { it.isNotBlank() })
                    }
                !sessionToken.isNullOrBlank() -> ConnectGuest(sessionToken)
                else -> NoCredentials
            }
    }
}

/** Le résultat d'une demande de connexion : une socket existe-t-elle (ou est-elle en route) ? */
public enum class SocketConnectOutcome { ARMED, NOT_ARMED }
