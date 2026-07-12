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

private struct PresenceRefreshPayload: Decodable, Sendable {
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

    /// Max ids per `?ids=` request. A single 200-id query built a ~5 KB URL that
    /// was slow (5.1s observed) and fragile against server header-size limits.
    static let chunkSize = 50

    private func performRefresh() async {
        guard APIClient.shared.authToken != nil else { return }
        let ids = PresenceManager.shared.knownUserIds
        guard !ids.isEmpty else { return }

        // Chunk the ids and fetch chunks CONCURRENTLY, ingesting each as it lands.
        // This keeps every URL small (~1.3 KB) and lets the first chunk refresh
        // the UI immediately instead of blocking behind a single giant request —
        // preserving the "fast refresh" intent while killing the URL-size risk.
        let chunks = Array(ids.prefix(200)).chunked(into: Self.chunkSize)
        await withTaskGroup(of: [PresenceRefreshEntry].self) { group in
            for chunk in chunks {
                group.addTask { await Self.fetchChunk(chunk) }
            }
            var total = 0
            for await entries in group where !entries.isEmpty {
                PresenceManager.shared.ingestRefresh(entries)
                total += entries.count
            }
            logger.info("Refreshed presence for \(total, privacy: .public) ids in \(chunks.count, privacy: .public) chunk(s)")
        }
    }

    // MainActor-isolated (module default) so it can touch `logger` and the
    // Decodable payload; the requests still overlap because `APIClient.request`
    // is nonisolated async — each `await` releases the MainActor.
    private static func fetchChunk(_ chunk: [String]) async -> [PresenceRefreshEntry] {
        let query = chunk.joined(separator: ",")
        do {
            let response: APIResponse<PresenceRefreshPayload> = try await APIClient.shared.request(
                endpoint: "/users/presence",
                queryItems: [URLQueryItem(name: "ids", value: query)]
            )
            return response.data.users
        } catch {
            // Network errors are expected on a flaky reconnect — log and move on.
            // The next foreground or snapshot will paper over the miss.
            logger.error("Presence refresh chunk failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }
}

extension Array {
    /// Splits into consecutive sub-arrays of at most `size` elements
    /// (`[1,2,3,4,5].chunked(into: 2)` → `[[1,2],[3,4],[5]]`).
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0 else { return isEmpty ? [] : [self] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0 ..< Swift.min($0 + size, count)])
        }
    }
}
