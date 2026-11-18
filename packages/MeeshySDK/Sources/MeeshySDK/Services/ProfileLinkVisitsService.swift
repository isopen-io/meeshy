import Foundation

/// Les visites de MON lien de profil (#19489) : `GET /users/me/profile-link/stats` (#19206), lues par le seul
/// propriétaire. La passerelle compte en jours UTC ; un chiffre absent, négatif ou illisible vaut « rien », jamais zéro :
/// l'écran qui le montre s'en passe.
public struct ProfileLinkVisitStats: Codable, Equatable, Sendable {
    public let today: Int?
    public let month: Int?

    public init(today: Int?, month: Int?) {
        self.today = today.flatMap(Self.count)
        self.month = month.flatMap(Self.count)
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(today: try? container.decodeIfPresent(Int.self, forKey: .today),
                  month: try? container.decodeIfPresent(Int.self, forKey: .month))
    }

    private static func count(_ value: Int) -> Int? { value >= 0 ? value : nil }

    private enum CodingKeys: String, CodingKey {
        case today, month
    }
}

public protocol ProfileLinkVisitsProviding: Sendable {
    func visits() async throws -> ProfileLinkVisitStats
}

public final class ProfileLinkVisitsService: ProfileLinkVisitsProviding, Sendable {
    public static let shared = ProfileLinkVisitsService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func visits() async throws -> ProfileLinkVisitStats {
        let response: APIResponse<ProfileLinkVisitStats> = try await api.request(
            UsersEndpoint.meProfileLinkStats,
            method: "GET",
            body: nil,
            queryItems: nil
        )
        return response.data
    }
}
