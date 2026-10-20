import Foundation

/// Où entre le monde entier : l'entrée World Wide servie par `GET /world`.
public protocol WorldEntryProviding: Sendable {
    func fetchWorldEntry() async throws -> WorldEntry
}

/// L'entrée d'un INVITÉ par la porte canonique d'un lien de partage
/// (`POST /links/:key/members`) — `key` accepte l'identifiant lisible du lien.
public protocol GuestLinkJoining: Sendable {
    func joinAsGuest(key: String, nickname: String, language: String) async throws -> LinkMembershipResponse
}

public final class WorldService: WorldEntryProviding, GuestLinkJoining, Sendable {
    public static let shared = WorldService()

    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func fetchWorldEntry() async throws -> WorldEntry {
        let response: APIResponse<WorldEntry> = try await api.request(WorldEndpoint.root)
        return response.data
    }

    public func joinAsGuest(key: String, nickname: String, language: String) async throws -> LinkMembershipResponse {
        let response: APIResponse<LinkMembershipResponse> = try await api.post(
            LinksEndpoint.byKeyMembers(key: key),
            body: LinkMembershipRequest(nickname: nickname, language: language)
        )
        return response.data
    }
}
