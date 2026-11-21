import Foundation

// MARK: - Protocol

/// Le fantôme global de ma position (#19203, #19469). La passerelle sert l'écriture ; la relecture est l'affaire de
/// #18025, d'ici là l'hôte garde la dernière valeur réglée.
public protocol LocationGhostProviding: Sendable {
    /// `PUT /me/location/ghost` — rend l'état réglé ; une erreur laisse l'hôte défaire son geste.
    func setGhost(_ ghost: Bool) async throws -> LocationGhostState
}

public final class LocationGhostService: LocationGhostProviding, Sendable {
    public static let shared = LocationGhostService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func setGhost(_ ghost: Bool) async throws -> LocationGhostState {
        let response: APIResponse<LocationGhostState> = try await api.put(
            MeEndpoint.locationGhost, body: LocationGhostChange(ghost: ghost)
        )
        return response.data
    }
}
