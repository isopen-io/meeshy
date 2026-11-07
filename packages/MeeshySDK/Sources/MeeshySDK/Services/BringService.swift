import Foundation

// MARK: - Protocol

/// Le Bring (#13936) sur les routes générées `BringEndpoint` et `RelationsEndpoint.byUserIdSettings`.
///
/// Le service ne décide d'aucune règle : la passerelle juge le niveau, le quota du jour, le blocage et le service
/// coupé ; l'envoi rend un `BringSendOutcome` que l'écran DIT, jamais une erreur à interpréter.
public protocol BringProviding: Sendable {
    /// `GET /bring/:userId` — lecture sans consommation.
    func availability(userId: String) async throws -> BringAvailability
    /// `POST /bring/:userId` — fait sonner l'autre.
    func send(userId: String) async -> BringSendOutcome
    /// `DELETE /bring/:bringId` — arrêt, par le destinataire (un geste) ou l'expéditeur (annulation).
    func stop(bringId: String) async throws
    /// `GET /relations/:userId/settings`.
    func personSettings(userId: String) async throws -> RelationPersonSettings
    /// `PUT /relations/:userId/settings { bringBlocked }` — corps strict, un seul réglage.
    func setBringBlocked(userId: String, blocked: Bool) async throws -> RelationPersonSettings
}

public final class BringService: BringProviding, Sendable {
    public static let shared = BringService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func availability(userId: String) async throws -> BringAvailability {
        let response: APIResponse<BringAvailability> = try await api.request(
            BringEndpoint.byUserId(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func send(userId: String) async -> BringSendOutcome {
        do {
            let response: APIResponse<BringSent> = try await api.post(BringEndpoint.byUserId(userId: userId), body: EmptyBody())
            return .sent(response.data)
        } catch {
            return BringSendOutcome.from(error)
        }
    }

    public func stop(bringId: String) async throws {
        let _: APIResponse<StopAck> = try await api.request(
            BringEndpoint.byBringId(bringId: bringId), method: "DELETE", body: nil, queryItems: nil
        )
    }

    public func personSettings(userId: String) async throws -> RelationPersonSettings {
        let response: APIResponse<RelationPersonSettings> = try await api.request(
            RelationsEndpoint.byUserIdSettings(userId: userId), method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func setBringBlocked(userId: String, blocked: Bool) async throws -> RelationPersonSettings {
        let response: APIResponse<RelationPersonSettings> = try await api.put(
            RelationsEndpoint.byUserIdSettings(userId: userId), body: BringBlockedBody(bringBlocked: blocked)
        )
        return response.data
    }

    private struct EmptyBody: Encodable {}

    private struct BringBlockedBody: Encodable {
        let bringBlocked: Bool
    }

    struct StopAck: Decodable, Sendable {
        let bringId: String?
        let stopped: Bool?
    }
}
