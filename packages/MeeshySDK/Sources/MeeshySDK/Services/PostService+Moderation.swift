import Foundation

/// Ce que la passerelle a refusé SANS erreur HTTP (#11535) : le reçu dit
/// pourquoi la publication n'a pas changé (`outranked`, `skipped`, `conflict`),
/// ou ne la cite pas du tout (`nil`).
public enum PublicationModerationError: Error, Equatable, Sendable {
    case notApplied(outcome: String?)
}

/// Le reçu d'un geste de modération de publications — seuls les champs lus.
public struct PublicationModerationReceipt: Decodable, Sendable {
    public struct Result: Decodable, Sendable {
        public let postId: String
        public let outcome: String

        public init(postId: String, outcome: String) {
            self.postId = postId
            self.outcome = outcome
        }
    }

    public let action: String
    public let results: [Result]

    public init(action: String, results: [Result]) {
        self.action = action
        self.results = results
    }

    /// `updated` : appliqué ; `unchanged` : la publication était déjà dans l'état visé.
    static let appliedOutcomes: Set<String> = ["updated", "unchanged"]

    func outcome(of postId: String) -> String? {
        results.first { $0.postId == postId }?.outcome
    }
}

struct PublicationModerationBody: Encodable, Sendable {
    let action: String
    let postIds: [String]
    let reason: String?
}

public extension PostServiceProviding {
    func makePrivate(postId: String, authorId: String, reason: String?) async throws {
        throw APIError.serverError(501, "makePrivate not implemented by \(Self.self)")
    }
}

extension PostService {
    /// **Rendre privée la publication d'un autre** (#11535) — la MÊME porte que
    /// la console d'administration web : `POST /admin/users/:authorId/publications/moderation`,
    /// action `make-private`. La passerelle tranche le droit (`canModerateContent`
    /// et la hiérarchie sur l'auteur), journalise et prévient l'auteur du motif.
    public func makePrivate(postId: String, authorId: String, reason: String?) async throws {
        let body = PublicationModerationBody(action: "make-private", postIds: [postId], reason: reason)
        let response: APIResponse<PublicationModerationReceipt> = try await api.post(
            AdminEndpoint.usersByUserIdPublicationsModeration(userId: authorId),
            body: body
        )
        let outcome = response.data.outcome(of: postId)
        guard let outcome, PublicationModerationReceipt.appliedOutcomes.contains(outcome) else {
            throw PublicationModerationError.notApplied(outcome: outcome)
        }
    }
}
