import Foundation

/// « En commun » (#19377) : `GET /users/:id/in-common` (#19200). La passerelle garde chaque partie par le cercle
/// commun ; le client ne fait que lire. `mediaKind` demande la page de médias d'un seul type (Photos, Vidéos…).
public protocol UserInCommonProviding: Sendable {
    func inCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon
}

public final class UserInCommonService: UserInCommonProviding, Sendable {
    public static let shared = UserInCommonService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// Les parties dans l'ordre de la fiche ; `history` n'est servie que par une passerelle qui la connaît (#19378).
    static let allParts = "communities,friends,media,history"

    public func inCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon {
        let queryItems = Self.queryItems(mediaKind: mediaKind)
        let response: APIResponse<UserInCommonWire> = try await api.request(
            UsersEndpoint.byIdInCommon(id: userId),
            method: "GET",
            body: nil,
            queryItems: queryItems
        )
        return response.data.value(for: userId)
    }

    static func queryItems(mediaKind: InCommonMediaKind?) -> [URLQueryItem] {
        guard let mediaKind else { return [URLQueryItem(name: "parts", value: allParts)] }
        return [URLQueryItem(name: "parts", value: "media"), URLQueryItem(name: "mediaKind", value: mediaKind.rawValue)]
    }
}

/// La charge du fil : `{ parts: { communities?, friends?, media? }, history? }`.
struct UserInCommonWire: Decodable {
    struct Parts: Decodable {
        let communities: InCommonListPart<InCommonCommunity>?
        let friends: InCommonListPart<InCommonFriend>?
        let media: InCommonMediaPart?

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            communities = try? container.decodeIfPresent(InCommonListPart<InCommonCommunity>.self, forKey: .communities)
            friends = try? container.decodeIfPresent(InCommonListPart<InCommonFriend>.self, forKey: .friends)
            media = try? container.decodeIfPresent(InCommonMediaPart.self, forKey: .media)
        }

        private enum CodingKeys: String, CodingKey {
            case communities, friends, media
        }
    }

    let parts: Parts?
    let history: [InCommonHistoryStep]?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        parts = try? container.decodeIfPresent(Parts.self, forKey: .parts)
        history = (try? container.decodeIfPresent(InCommonLossyList<InCommonHistoryStep>.self, forKey: .history))?.values
    }

    private enum CodingKeys: String, CodingKey {
        case parts, history
    }

    func value(for userId: String) -> UserInCommon {
        UserInCommon(id: userId, communities: parts?.communities, friends: parts?.friends, media: parts?.media,
                     history: history)
    }
}
