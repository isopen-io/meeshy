import Foundation

/// « Voir comme » (#18869) : MA fiche telle qu'un lecteur ordinaire d'un cercle la reçoit, servie par
/// `GET /directory/people/:handle?as=<CERCLE>` (#18861). Seul le propriétaire peut la demander ; le
/// serveur rend la vue du cercle (`circle`), la présence et les compteurs que CE lecteur recevrait.
public protocol ProfileSeenAsProviding: Sendable {
    func vitrine(handle: String, seenAs level: RelationLevel) async throws -> PublicProfile
}

public final class ProfileSeenAsService: ProfileSeenAsProviding, Sendable {
    public static let shared = ProfileSeenAsService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// Les expansions, triées : la même demande produit la même URL, donc le même ETag.
    static let expansions = "circle,presence,stats"

    public func vitrine(handle: String, seenAs level: RelationLevel) async throws -> PublicProfile {
        let encoded = handle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? handle
        let response: APIResponse<PublicProfile> = try await api.request(
            DirectoryEndpoint.peopleByHandle(handle: encoded),
            method: "GET",
            body: nil,
            queryItems: [
                URLQueryItem(name: "as", value: level.rawValue),
                URLQueryItem(name: "expand", value: Self.expansions),
            ]
        )
        return response.data
    }
}
