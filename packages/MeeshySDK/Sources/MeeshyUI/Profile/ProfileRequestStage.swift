import Foundation
import MeeshySDK

/// L'étape d'une demande d'ami vue depuis la fiche d'un autre (planche `Etat-Demande`) : aucune, envoyée (depuis la
/// date servie, si le cache la garde), reçue (avec le mot de l'émetteur, rogné, servi par mon Prisme), acceptée à
/// l'instant sur cette fiche (« Vous êtes amis »), déjà amis, ou fermée (la personne n'accepte pas de nouvelles
/// demandes, #19460). Une demande d'un autre identifiant ne prête ni sa date ni son mot. Une demande qui n'est pas
/// partie (planche `Etat-Erreur` vue 2) remet la carte d'ouverture et le dit — sauf si la personne a fermé ses demandes.
nonisolated enum ProfileRequestStage: Equatable, Sendable {
    case open
    case unsent
    case closed
    case sent(sentAt: Date?)
    case received(note: ProfileReceivedNote?)
    case accepted
    case connected

    /// - Parameters:
    ///   - prism: mes langues, dans l'ordre du Prisme (`ReaderPrism`), pour servir le mot reçu.
    ///   - acceptsRequests: `false` quand la fiche dit que la personne ferme les nouvelles demandes ; `nil` = ouvert.
    static func resolve(connection: ConnectionStatus, request: FriendRequest?, justAccepted: Bool,
                        sendFailed: Bool = false, prism: [String] = [],
                        acceptsRequests: Bool? = nil) -> ProfileRequestStage {
        switch connection {
        case .none:
            if acceptsRequests == false { return .closed }
            return sendFailed ? .unsent : .open
        case .pendingSent(let requestId):
            return .sent(sentAt: matching(request, requestId)?.createdAt)
        case .pendingReceived(let requestId):
            return .received(note: matching(request, requestId).flatMap { ProfileReceivedNote.resolve($0, prism: prism) })
        case .connected:
            return justAccepted ? .accepted : .connected
        }
    }

    /// Une NOUVELLE demande se propose (carte d'ouverture, rangée « Demander à être amis » des inconnus) seulement sans
    /// lien, sans demande en cours, et tant que la personne ne ferme pas ses demandes.
    var offersRequest: Bool {
        self == .open || self == .unsent
    }

    /// Sans amitié acceptée, le cercle commun reste Public à toutes les étapes d'une demande — ouverte, pas partie,
    /// fermée, envoyée ou reçue : ce qui est fermé reste dit (loi 4), une demande en cours n'ouvre rien.
    var leavesTheCirclePublic: Bool {
        switch self {
        case .open, .unsent, .closed, .sent, .received: return true
        case .accepted, .connected: return false
        }
    }

    private static func matching(_ request: FriendRequest?, _ requestId: String) -> FriendRequest? {
        guard let request, request.id == requestId else { return nil }
        return request
    }
}
