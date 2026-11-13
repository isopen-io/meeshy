import Foundation

/// Ce que devient ICE quand des identifiants TURN frais viennent d'être posés
/// (#8074).
///
/// `updateIceServers` ne fait que `setConfiguration` : les allocations déjà
/// faites gardent les anciens identifiants, qui expirent — et coturn refuse de
/// rafraîchir une allocation au-delà de l'échéance gravée dans le nom
/// d'utilisateur. Sans relance, un appel relayé perd son chemin à l'expiration,
/// même s'il a reçu à temps de quoi le renouveler.
nonisolated enum TurnRefreshIceAction: Equatable, Sendable {
    /// Rien à relancer : aucune négociation n'existe encore (sonnerie, offre),
    /// ou ICE est déjà en cours et son gardien relancera avec la nouvelle
    /// configuration (`.connecting`, `.reconnecting` — une reconnexion a déjà
    /// émis SON offre : la réarmer en enverrait une seconde, #17955), ou
    /// l'appel est fini.
    case inert
    /// L'appel est établi : une relance ICE discrète re-collecte les
    /// candidats relais avec les identifiants frais. La paire en service
    /// continue de porter le média jusqu'à ce qu'une nouvelle soit élue, donc
    /// l'utilisateur ne voit rien — et l'appel ne passe pas par « Reconnexion… ».
    case restartIce
}

/// La décision, pure, pour que chaque état de l'automate soit éprouvé.
nonisolated enum TurnCredentialRefreshPolicy {
    static func iceAction(after state: CallState) -> TurnRefreshIceAction {
        switch state {
        case .connected: return .restartIce
        case .idle, .ringing, .offering, .connecting, .reconnecting, .ended: return .inert
        }
    }
}
