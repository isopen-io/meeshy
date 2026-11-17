import Foundation

// MARK: - Protocol

/// La position du Sang (#13937, #18872) : l'historique d'un Sang qui me l'a consenti, mon journal de consultations, mon
/// fantôme et l'effacement de mon historique. Ne s'appelle que si `RelationsConfig.bloodLocationEnabled` : hors
/// drapeau, chaque route répond 404 comme une route inconnue, et l'erreur remonte telle quelle.
public protocol BloodLocationProviding: Sendable {
    /// `GET /relations/:userId/location/history` — `since` borne le début de la fenêtre, `limit` le nombre de points.
    func history(of userId: String, since: Date?, limit: Int?) async throws -> BloodLocationHistory
    /// `GET /me/location/consultations` — qui a lu mon historique.
    func consultations() async throws -> BloodLocationConsultations
    /// `PUT /me/location/blood-settings` — `false` : la passerelle a refusé le réglage (personne hors Sang, par exemple).
    func update(_ change: BloodLocationSettingsChange) async throws -> Bool
    /// `DELETE /me/location/history` — efface tout mon historique.
    func eraseHistory() async throws
}

public final class BloodLocationService: BloodLocationProviding, Sendable {
    public static let shared = BloodLocationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func history(of userId: String, since: Date?, limit: Int?) async throws -> BloodLocationHistory {
        let items = [
            since.map { URLQueryItem(name: "since", value: WireDate.string(from: $0)) },
            limit.map { URLQueryItem(name: "limit", value: String(min(max($0, 1), BloodLocationContract.historyMaxLimit))) },
        ].compactMap { $0 }
        let response: APIResponse<BloodLocationHistory> = try await api.request(
            RelationsEndpoint.byUserIdLocationHistory(userId: userId), method: "GET", body: nil,
            queryItems: items.isEmpty ? nil : items
        )
        return response.data
    }

    public func consultations() async throws -> BloodLocationConsultations {
        let response: APIResponse<BloodLocationConsultations> = try await api.request(
            MeEndpoint.locationConsultations, method: "GET", body: nil, queryItems: nil
        )
        return response.data
    }

    public func update(_ change: BloodLocationSettingsChange) async throws -> Bool {
        let response: APIResponse<SettingsAck> = try await api.put(MeEndpoint.locationBloodSettings, body: change)
        return response.data.ok ?? response.success
    }

    public func eraseHistory() async throws {
        let _: APIResponse<SettingsAck> = try await api.request(
            MeEndpoint.locationHistory, method: "DELETE", body: nil, queryItems: nil
        )
    }

    /// La passerelle sert `{ ok }` au réglage et `{ erased }` à l'effacement : seul `ok` se lit.
    private struct SettingsAck: Decodable {
        let ok: Bool?
    }
}
