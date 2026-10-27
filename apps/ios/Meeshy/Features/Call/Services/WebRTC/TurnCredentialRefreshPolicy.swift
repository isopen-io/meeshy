import Foundation

/// Ce que devient ICE quand des identifiants TURN frais viennent d'être posés
/// (#8074 ; audit appels 2026-07-11 #9).
///
/// `updateIceServers` ne fait que `setConfiguration` : les allocations déjà
/// faites gardent les anciens identifiants, qui expirent — et coturn refuse de
/// rafraîchir une allocation au-delà de l'échéance gravée dans le nom
/// d'utilisateur. Sans relance, un appel relayé perd son chemin à l'expiration,
/// même s'il a reçu à temps de quoi le renouveler.
nonisolated enum TurnRefreshIceAction: Equatable, Sendable {
    /// Rien à relancer : aucune négociation n'existe encore (sonnerie, offre),
    /// ou ICE est déjà en cours et son gardien relancera avec la nouvelle
    /// configuration (`.connecting`), ou l'appel est fini.
    case inert
    /// Une reconnexion est en vol : on RÉARME sa tentative, qui re-collecte
    /// avec les identifiants qu'on vient de poser au lieu d'attendre que le
    /// gardien de `.reconnecting` escalade.
    case rearmReconnect
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
        case .reconnecting: return .rearmReconnect
        case .connected: return .restartIce
        case .idle, .ringing, .offering, .connecting, .ended: return .inert
        }
    }
}
