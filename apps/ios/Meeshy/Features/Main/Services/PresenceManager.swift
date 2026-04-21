import Foundation
import Combine
import MeeshySDK

// MARK: - User Presence

struct UserPresence: Codable {
    let isOnline: Bool
    let lastActiveAt: Date?

    var state: PresenceState {
        guard isOnline else { return .offline }
        guard let last = lastActiveAt else { return .online }
        return Date().timeIntervalSince(last) > 300 ? .away : .online
    }
}

// MARK: - Presence Manager

@MainActor
final class PresenceManager: ObservableObject {
    static let shared = PresenceManager()

    @Published var presenceMap: [String: UserPresence] = [:] {
        didSet { schedulePersist() }
    }

    private var cancellables = Set<AnyCancellable>()
    nonisolated(unsafe) private var recalcTimer: Timer?
    nonisolated(unsafe) private var persistTask: Task<Void, Never>?

    private nonisolated static let persistFileName = "presence_map.json"
    private nonisolated static let persistMaxAge: TimeInterval = 24 * 3600 // 24h
    private static let persistDebounce: TimeInterval = 1.5

    private init() {
        // Hydrate from disk BEFORE subscribing so the first render frame shows
        // the last-known online dots instead of "everyone is offline" — the
        // iMessage/WhatsApp feel requires the state to appear instantly even
        // on a cold start before the first `user:status` event lands.
        presenceMap = Self.loadFromDisk()

        // Subscribe to user:status events from socket
        MessageSocketManager.shared.userStatusChanged
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.presenceMap[event.userId] = UserPresence(
                    isOnline: event.isOnline,
                    lastActiveAt: event.lastActiveAt
                )
            }
            .store(in: &cancellables)

        // Keep the last-known presence snapshot across brief socket drops
        // (e.g. iOS background → foreground transition). Wiping the map the
        // moment `isConnected` flips to false caused all avatars to lose
        // their online dots during every resume, which felt like the app
        // "forgot" who was online. The `.away` computed state still kicks in
        // after 5 min of inactivity, so stale data decays gracefully.
        // Presence will be refreshed when `user:status` events resume.

        // Recalculate every 60s — déclenche un re-render seulement si un utilisateur
        // passe de online → away dans cette fenêtre (lastActiveAt entre 300 et 360s)
        recalcTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                let hasTransition = self.presenceMap.values.contains { presence in
                    guard presence.isOnline, let last = presence.lastActiveAt else { return false }
                    let elapsed = Date().timeIntervalSince(last)
                    return elapsed > 300 && elapsed <= 360
                }
                if hasTransition {
                    self.objectWillChange.send()
                }
            }
        }
    }

    // Seed initial presence from conversations API response
    func seed(from conversations: [APIConversation], currentUserId: String) {
        for conv in conversations {
            guard let participants = conv.participants else { continue }
            for participant in participants where participant.userId != currentUserId {
                guard let userId = participant.userId else { continue }
                let isOnline = participant.isOnline ?? participant.user?.isOnline ?? false
                let lastActive = participant.lastActiveAt ?? participant.user?.lastActiveAt
                presenceMap[userId] = UserPresence(
                    isOnline: isOnline,
                    lastActiveAt: lastActive
                )
            }
        }
    }

    func presenceState(for userId: String) -> PresenceState {
        presenceMap[userId]?.state ?? .offline
    }

    deinit {
        recalcTimer?.invalidate()
        recalcTimer = nil
        persistTask?.cancel()
    }

    // MARK: - Disk Persistence

    /// Debounce writes so a burst of `user:status` events during reconnect
    /// doesn't hammer the filesystem. 1.5s is short enough that backgrounding
    /// immediately after still captures the latest state via
    /// `UIApplication.didEnterBackgroundNotification`.
    private nonisolated func schedulePersist() {
        persistTask?.cancel()
        persistTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.persistDebounce * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.persistToDisk()
        }
    }

    private func persistToDisk() {
        let snapshot = presenceMap
        Task.detached(priority: .utility) {
            Self.writeToDisk(snapshot)
        }
    }

    private nonisolated static var persistURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }
        return cacheDir.appendingPathComponent(persistFileName)
    }

    private nonisolated static func writeToDisk(_ map: [String: UserPresence]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(map) else { return }
        try? data.write(to: persistURL, options: .atomic)
    }

    private static func loadFromDisk() -> [String: UserPresence] {
        let url = persistURL
        guard FileManager.default.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url) else { return [:] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let map = try? decoder.decode([String: UserPresence].self, from: data) else { return [:] }
        // Drop entries older than 24h — claiming someone is online based on
        // day-old data would be actively wrong, but a 15-min gap is fine and
        // still avoids the "all offline on cold start" flash.
        let cutoff = Date().addingTimeInterval(-persistMaxAge)
        return map.filter { _, presence in
            (presence.lastActiveAt ?? .distantPast) >= cutoff
        }
    }
}
