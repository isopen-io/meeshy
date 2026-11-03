package me.meeshy.sdk.model.socket

/** Où en est le lien temps réel. */
public sealed interface SocketLink {
    /** Aucune socket : jamais ouverte, fermée volontairement ou suspendue en arrière-plan. */
    public data object Disconnected : SocketLink

    /** Première ouverture en cours. */
    public data object Connecting : SocketLink

    public data object Connected : SocketLink

    /** Le lien est tombé après avoir existé : [attempt] tentatives de l'échelle déjà consommées. */
    public data class Reconnecting(val attempt: Int) : SocketLink
}

/**
 * État de lien riche (miroir de l'état de connexion d'iOS) : [link] + [hadPreviousConnection], qui distingue la
 * PREMIÈRE connexion d'une reconnexion — seule une reconnexion émet `didReconnect` (rattrapage des messages manqués).
 * `hadPreviousConnection` survit à une suspension d'arrière-plan et ne s'efface qu'à une fermeture volontaire.
 */
public data class SocketLinkState(
    val link: SocketLink = SocketLink.Disconnected,
    val hadPreviousConnection: Boolean = false,
) {
    /** Le résultat d'une connexion établie et si elle suivait une précédente. */
    public data class Established(val state: SocketLinkState, val wasReconnect: Boolean)

    public val isConnected: Boolean get() = link == SocketLink.Connected

    /** Un transport vient d'être construit. */
    public fun opened(): SocketLinkState = copy(link = pending())

    public fun connected(): Established =
        Established(copy(link = SocketLink.Connected, hadPreviousConnection = true), wasReconnect = hadPreviousConnection)

    /** Le transport est perdu ou refusé : une tentative est en route (Socket.IO ou l'échelle de l'app). */
    public fun transportLost(): SocketLinkState = copy(link = pending())

    /** L'échelle de l'app a consommé sa [attempt]-ième tentative. */
    public fun reconnecting(attempt: Int): SocketLinkState = copy(link = SocketLink.Reconnecting(attempt))

    /** Suspension d'arrière-plan : plus de socket, mais l'historique est gardé (le retour est une reconnexion). */
    public fun suspended(): SocketLinkState = copy(link = SocketLink.Disconnected)

    /** Fermeture volontaire : la session est finie, tout s'oublie. */
    public fun closed(): SocketLinkState = SocketLinkState()

    private fun pending(): SocketLink =
        if (hadPreviousConnection) SocketLink.Reconnecting(0) else SocketLink.Connecting
}
