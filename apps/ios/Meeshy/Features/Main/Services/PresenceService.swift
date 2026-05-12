import Foundation
import MeeshySDK
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "presence-service")

/// Une entrée du payload REST `GET /users/presence?ids=...`. Le gateway renvoie
/// `{ userId, isOnline, lastActiveAt }` (pas de `username` — c'est seulement le
/// snapshot socket qui le porte). Voir
/// `services/gateway/src/routes/users/presence.ts`.
public struct PresenceRefreshEntry: Decodable, Sendable {
    public let userId: String
    public let isOnline: Bool
    public let lastActiveAt: Date?
}

private struct PresenceRefreshPayload: Decodable {
    let users: [PresenceRefreshEntry]
}

/// REST refresh path for the presence map. Used on foreground transitions and
/// socket reconnects so the dot states catch up even if a `user:status` event
/// was missed while the app was suspended.
///
/// Source de vérité gateway : `GET /api/v1/users/presence?ids=...` (max 200 ids).
@MainActor
final class PresenceService {
    static let shared = PresenceService()

    /// Coalesce overlapping refresh calls: a foreground transition that races
    /// with the socket reconnect callback would otherwise hit the endpoint
    /// twice within ~100ms.
    private var inFlight: Task<Void, Never>?

    private init() {}

    /// Refresh up to 200 known userIds against the gateway. Reads the userIds
    /// from `PresenceManager.shared.knownUserIds` and writes the response back
    /// through `PresenceManager.shared.ingestRefresh`. No-op when no auth token
    /// (guests don't have a presence map worth refreshing) or when no userIds
    /// are tracked yet.
    func refreshKnownUsers() {
        if let inFlight, !inFlight.isCancelled {
            // Re-use the in-flight call instead of stacking a second one.
            return
        }
        inFlight = Task { [weak self] in
            defer { Task { @MainActor in self?.inFlight = nil } }
            await self?.performRefresh()
        }
    }

    private func performRefresh() async {
        guard APIClient.shared.authToken != nil else { return }
        let ids = PresenceManager.shared.knownUserIds
        guard !ids.isEmpty else { return }

        // Gateway accepts max 200 ids per call. Take the first chunk — the
        // remaining contacts will catch up on the next snapshot or status
        // event. We intentionally don't paginate here because the typical
        // contact set on iOS is <200 and adding a loop would defer the UI
        // refresh past the moment the user is actually looking at the list.
        let trimmed = Array(ids.prefix(200))
        let query = trimmed.joined(separator: ",")

        do {
            let response: APIResponse<PresenceRefreshPayload> = try await APIClient.shared.request(
                endpoint: "/users/presence",
                queryItems: [URLQueryItem(name: "ids", value: query)]
            )
            PresenceManager.shared.ingestRefresh(response.data.users)
            logger.info("Refreshed presence for \(response.data.users.count, privacy: .public) ids")
        } catch {
            // Network errors are expected on a flaky reconnect — log and move
            // on. The next foreground or snapshot will paper over the miss.
            logger.error("Presence refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
