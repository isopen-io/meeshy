import Foundation
import MeeshySDK

/// Ce que l'écrivain a fait d'une citation.
nonisolated enum ComposerQuoteOutcome: Equatable {
    /// Partie sur le réseau, ou gravée dans la file durable hors ligne.
    case accepted(RepostOutcome)
    /// Refusée avant tout réseau.
    case refused(ComposerQuoteRefusal)
    /// Une republication de la même source attend déjà : la nouvelle, avec son
    /// commentaire, ne partirait pas.
    case alreadyPending
    /// Le réseau l'a refusée.
    case failed(RepostFailure)

    var isAccepted: Bool {
        guard case .accepted = self else { return false }
        return true
    }
}

/// **La citation passe par l'ÉCRIVAIN UNIQUE du repost** (`RepostPublisher`).
///
/// Hors ligne, il grave la citation dans la file durable (`.repostPost`), qui la
/// dépêche à la reconnexion et survit à la mort de l'app. En ligne, il l'envoie
/// avec son `X-Client-Mutation-Id` ; un échec n'y est jamais silencieux : le
/// compositeur reste ouvert, le commentaire intact.
///
/// Ce n'est PAS la file du document (`ComposerDocumentSendPlan`), qui refuse
/// une citation par construction : elle publierait un post sans source.
nonisolated struct ComposerQuotePublisher: Sendable {

    private let writer: RepostPublisher

    init(writer: RepostPublisher = .shared) {
        self.writer = writer
    }

    func publish(_ draft: ComposerDocumentDraft) async -> ComposerQuoteOutcome {
        let intention: RepostIntent
        switch ComposerQuoteSendPlan.plan(for: draft) {
        case .refuse(let raison): return .refused(raison)
        case .send(let prete): intention = prete
        }
        do {
            let issue = try await writer.publish(intention)
            switch issue {
            case .sent, .queued: return .accepted(issue)
            case .alreadyInFlight, .alreadyQueued: return .alreadyPending
            }
        } catch {
            return .failed(RepostFailure.classify(error))
        }
    }
}
