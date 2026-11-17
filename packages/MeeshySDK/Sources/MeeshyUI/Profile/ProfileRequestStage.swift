import Foundation
import MeeshySDK

/// L'étape d'une demande d'ami vue depuis la fiche d'un autre (planche `Etat-Demande`) : aucune, envoyée (depuis la
/// date servie, si le cache la garde), reçue (avec le mot de l'émetteur, rogné), acceptée à l'instant sur cette fiche
/// (« Vous êtes amis »), ou déjà amis. Une demande d'un autre identifiant ne prête ni sa date ni son mot.
nonisolated enum ProfileRequestStage: Equatable, Sendable {
    case open
    case sent(sentAt: Date?)
    case received(note: String?)
    case accepted
    case connected

    static func resolve(connection: ConnectionStatus, request: FriendRequest?, justAccepted: Bool) -> ProfileRequestStage {
        switch connection {
        case .none:
            return .open
        case .pendingSent(let requestId):
            return .sent(sentAt: matching(request, requestId)?.createdAt)
        case .pendingReceived(let requestId):
            return .received(note: matching(request, requestId).flatMap { note(of: $0) })
        case .connected:
            return justAccepted ? .accepted : .connected
        }
    }

    private static func matching(_ request: FriendRequest?, _ requestId: String) -> FriendRequest? {
        guard let request, request.id == requestId else { return nil }
        return request
    }

    private static func note(of request: FriendRequest) -> String? {
        let trimmed = request.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}
