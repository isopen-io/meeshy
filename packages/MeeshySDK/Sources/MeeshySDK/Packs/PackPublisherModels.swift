import Foundation

// MARK: - L'éditeur d'un pack (#16274, #16315, #16433)
//
// MIROIR de `PackPublisherRef` (`packages/shared/types/pack-publisher.ts`) et de la page
// `GET /publishers/:slug/page` (`services/gateway/src/routes/pack-publishers.ts`).

/// Ce que la boutique sert d'un éditeur : son adresse et son nom de boutique.
public struct PackPublisherRef: Codable, Hashable, Sendable {
    public let slug: String
    public let name: String
    public let verified: Bool
    /// L'éditeur du compte officiel Meeshy.
    public let official: Bool

    public init(slug: String, name: String, verified: Bool, official: Bool) {
        self.slug = slug
        self.name = name
        self.verified = verified
        self.official = official
    }
}

/// Le compte Meeshy qui édite : de quoi ouvrir son profil, rien d'autre.
public struct PackPublisherOwner: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public init(id: String, username: String, displayName: String?, avatar: String?) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
    }
}

/// **La page d'un éditeur** : son identité, son site, et le profil qui l'édite — `nil` si ce
/// compte n'est plus actif ou si lui et le lecteur se sont bloqués.
public struct PackPublisherPage: Codable, Hashable, Sendable {
    public let publisher: PackPublisherRef
    public let owner: PackPublisherOwner?
    public let website: String?

    public init(publisher: PackPublisherRef, owner: PackPublisherOwner?, website: String?) {
        self.publisher = publisher
        self.owner = owner
        self.website = website
    }
}

public protocol PackPublisherProviding: Sendable {
    func page(slug: String) async throws -> PackPublisherPage
}

public final class PackPublisherService: PackPublisherProviding, Sendable {
    public static let shared = PackPublisherService()

    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func page(slug: String) async throws -> PackPublisherPage {
        let response: APIResponse<PackPublisherPage> = try await api.request(
            PublishersEndpoint.bySlugPage(slug: slug), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }
}
