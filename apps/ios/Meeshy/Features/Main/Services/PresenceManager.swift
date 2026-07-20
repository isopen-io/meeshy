import Foundation
import Combine
import MeeshySDK

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
    private nonisolated static let persistDebounce: TimeInterval = 1.5

    private init() {
        // Start with empty map; disk I/O runs off-main below to avoid blocking
        // the launch thread. Using the Published backing store directly bypasses
        // didSet so we don't schedule a spurious persist of the empty state.
        _presenceMap = Published(initialValue: [:])

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

        // Subscribe to the post-auth presence snapshot. Lets us seed the entire
        // contact set in one shot instead of waiting for each contact to emit a
        // `user:status` transition (which only fires on state changes — so a
        // user who's been online for hours would never light up otherwise).
        MessageSocketManager.shared.presenceSnapshotReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.ingestSnapshot(event.users)
            }
            .store(in: &cancellables)

        // Typing = signal de présence le plus fort : l'émetteur est actif LÀ,
        // MAINTENANT. Le gateway persiste lastActiveAt sur typing:start mais ne
        // rebroadcaste pas de user:status — sans ce bump local, la pastille
        // décroissait (vert → orange → gris) pendant que « X écrit… » s'affichait.
        MessageSocketManager.shared.typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.noteActivity(userId: event.userId)
            }
            .store(in: &cancellables)

        // Keep the last-known presence snapshot across brief socket drops
        // (e.g. iOS background → foreground transition). Wiping the map the
        // moment `isConnected` flips to false caused all avatars to lose
        // their online dots during every resume, which felt like the app
        // "forgot" who was online. The computed decay (away at 1 min, idle at
        // 3 min, offline at 5 min) still applies, so stale data degrades
        // gracefully. Presence will be refreshed when `user:status` events resume.

        // Hydrate from disk off-main: fills entries not yet populated by a
        // real-time socket event (live updates take precedence via merging).
        Task { @MainActor [weak self] in
            let loaded = await Task.detached(priority: .utility) {
                Self.loadFromDisk()
            }.value
            guard let self else { return }
            self.presenceMap = loaded.merging(self.presenceMap) { _, liveEntry in liveEntry }
        }

        // Recalcule toutes les 30s — déclenche un re-render seulement si un
        // utilisateur traverse une frontière d'état 1/3/5 dans cette fenêtre :
        // online → away à 60s, away → idle à 180s, idle → offline à 300s.
        recalcTimer = Timer.scheduledTimer(withTimeInterval: Self.recalcInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                let hasTransition = self.presenceMap.values.contains { Self.isNearStateFlip($0) }
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

    /// Preuve d'activité immédiate observée côté client (typing:start reçu) :
    /// force l'état online local pour cet utilisateur, sans attendre le
    /// prochain user:status / snapshot du gateway.
    func noteActivity(userId: String) {
        guard !userId.isEmpty else { return }
        presenceMap[userId] = UserPresence(isOnline: true, lastActiveAt: Date())
    }

    /// Présence temps réel si l'utilisateur est suivi par le manager, `nil`
    /// sinon. Injecté comme `presenceProvider` de `UserProfileSheet` : le
    /// profil affiche la MÊME pastille que la liste de conversations quand la
    /// donnée live existe, et retombe sur son snapshot REST `isOnline` pour
    /// les profils hors du périmètre suivi (contacts jamais croisés).
    func knownPresenceState(for userId: String) -> PresenceState? {
        presenceMap[userId]?.state
    }

    /// Pastille tri-state pour les listes : présence temps réel du manager si
    /// l'utilisateur est suivi, sinon calcul depuis le snapshot REST
    /// (`isOnline` + `lastActiveAt`) du modèle de la row.
    func resolvedState(userId: String?, isOnline: Bool?, lastActiveAt: Date? = nil) -> PresenceState {
        if let userId, let live = knownPresenceState(for: userId) { return live }
        return UserPresence(isOnline: isOnline ?? false, lastActiveAt: lastActiveAt).state
    }

    /// Cadence du timer de recalcul. Egale a la largeur des fenetres de
    /// `isNearStateFlip` : chaque transition 1/3/5 est captee par le tick
    /// qui suit la frontiere (retard maximal d'un tick).
    nonisolated static let recalcInterval: TimeInterval = 30

    nonisolated static func isNearStateFlip(_ presence: UserPresence, now: Date = Date()) -> Bool {
        guard let last = presence.lastActiveAt else { return false }
        let elapsed = now.timeIntervalSince(last)
        // Fenetres de bascule 1/3/5 (60s online→away, 180s away→idle, 300s idle→offline).
        return (elapsed > 60 && elapsed <= 90)
            || (elapsed > 180 && elapsed <= 210)
            || (elapsed > 300 && elapsed <= 330)
    }

    /// Apply a bulk presence snapshot received via the `presence:snapshot` socket
    /// event — sent right after auth, and re-sent on every reconnect since the
    /// gateway re-authenticates on each new socket connection.
    ///
    /// Each entry replaces the local presence row for that userId so a contact
    /// that was online in our cache but is now offline server-side gets corrected
    /// (closes the "stale online forever" failure mode).
    func ingestSnapshot(_ users: [UserStatusEvent]) {
        guard !users.isEmpty else { return }
        let updates = Dictionary(
            uniqueKeysWithValues: users.map { entry in
                (entry.userId, UserPresence(isOnline: entry.isOnline, lastActiveAt: entry.lastActiveAt))
            }
        )
        presenceMap.merge(updates) { _, newEntry in newEntry }
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

    private nonisolated static func loadFromDisk() -> [String: UserPresence] {
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
