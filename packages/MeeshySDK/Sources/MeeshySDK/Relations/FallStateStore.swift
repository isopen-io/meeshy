import Combine
import Foundation

/// Où la chute détectée des autres survit à un démarrage à froid. Isolé pour être remplacé en test.
public protocol FallStatePersisting: Sendable {
    func load() -> [FallState]
    func save(_ states: [FallState])
}

/// La chute détectée des autres, cache d'abord (#18748) : ce qui a été servi se montre tout de suite, la socket et
/// l'instantané REST le corrigent ensuite. Une chute plus ANCIENNE que celle tenue ne la remplace pas, `fall:cleared`
/// (ou la levée poussée) l'efface, l'instantané fait foi, et un état dont `expiresAt` est passé ne s'affiche plus — ni au
/// rechargement du cache. Chaque écriture ÉLAGUE ce qui a expiré, et le store se réveille de lui-même à l'`expiresAt` le
/// plus proche : un épisode expiré ne dort ni en mémoire ni sur le disque. La dernière POSITION n'est JAMAIS rangée au
/// repos.
@MainActor
public final class FallStateStore: ObservableObject {

    public static let shared = FallStateStore(persistence: FileFallStatePersistence.applicationSupport())

    @Published public private(set) var states: [String: FallState]

    private let persistence: FallStatePersisting
    private let now: () -> Date
    private let sleep: @MainActor (TimeInterval) async -> Void
    /// Le réveil programmé à l'`expiresAt` le plus proche.
    private(set) var expiryTask: Task<Void, Never>?

    nonisolated deinit {}

    public init(
        persistence: FallStatePersisting,
        now: @escaping () -> Date = { Date() },
        sleep: @escaping @MainActor (TimeInterval) async -> Void = { delay in
            do { try await Task.sleep(for: .seconds(max(0, delay))) } catch { return }
        }
    ) {
        self.persistence = persistence
        self.now = now
        self.sleep = sleep
        let loaded = persistence.load()
        let live = Self.live(loaded, at: now())
        self.states = live
        if live.count != loaded.count { persistence.save(live.values.map(\.withoutPosition)) }
        scheduleExpiry()
    }

    /// L'épisode servi pour une personne, `nil` hors épisode, passé `expiresAt`, ou quand elle ne me le partage pas.
    public func state(for userId: String) -> FallState? {
        guard let state = states[userId], !state.isExpired(at: now()) else { return nil }
        return state
    }

    /// L'`expiresAt` le plus proche parmi les épisodes tenus — l'instant où le store s'élague de lui-même.
    public var nextExpiry: Date? {
        states.values.map(\.expiresAt).min()
    }

    /// `fall:detected` : une chute plus ancienne que celle tenue ne la remplace pas ; un état déjà expiré ne s'affiche pas.
    public func apply(_ event: FallDetected) {
        if let held = states[event.userId], held.detectedAt > event.state.detectedAt { return }
        let next = event.state.isExpired(at: now()) ? nil : event.state
        guard states[event.userId] != next else { return }
        commit { $0[event.userId] = next }
    }

    /// `fall:cleared`, ou la levée poussée (`safety_alert_cleared`) : l'état s'efface.
    public func clear(userId: String) {
        guard states[userId] != nil else { return }
        commit { $0[userId] = nil }
    }

    /// L'instantané REST fait foi : ce qu'il ne porte plus n'est plus en cours.
    public func reconcile(with snapshot: [FallState]) {
        let fresh = Self.live(snapshot, at: now())
        guard fresh != states else { return }
        commit { $0 = fresh }
    }

    /// Au changement de compte : rien ne survit au compte.
    public func reset() {
        guard !states.isEmpty else { return }
        commit { $0 = [:] }
    }

    /// Retire ce dont `expiresAt` est passé, en mémoire ET sur le disque.
    public func pruneExpired() {
        let live = Self.live(Array(states.values), at: now())
        guard live != states else { return }
        commit { $0 = live }
    }

    private nonisolated static func live(_ states: [FallState], at instant: Date) -> [String: FallState] {
        Dictionary(
            states.filter { !$0.isExpired(at: instant) }.map { ($0.userId, $0) },
            uniquingKeysWith: { lhs, rhs in lhs.detectedAt >= rhs.detectedAt ? lhs : rhs }
        )
    }

    private func commit(_ change: (inout [String: FallState]) -> Void) {
        var next = states
        change(&next)
        let live = Self.live(Array(next.values), at: now())
        states = live
        persistence.save(live.values.map(\.withoutPosition))
        scheduleExpiry()
    }

    private func scheduleExpiry() {
        expiryTask?.cancel()
        guard let deadline = nextExpiry else {
            expiryTask = nil
            return
        }
        let delay = deadline.timeIntervalSince(now())
        let sleep = self.sleep
        expiryTask = Task { [weak self] in
            await sleep(delay)
            guard !Task.isCancelled else { return }
            self?.pruneExpired()
        }
    }
}

/// La persistance par défaut : un fichier JSON dans Application Support (#18748). La chute d'un Sang est une donnée de
/// santé d'un TIERS : son dossier est EXCLU de la sauvegarde iCloud, le fichier est chiffré tant que l'appareil est
/// verrouillé (`.completeFileProtection`), et une écriture qui échoue (appareil verrouillé) EFFACE le fichier plutôt
/// que de laisser au repos un état périmé — au pire, le démarrage à froid suivant attend le rattrapage. La dernière
/// POSITION n'y entre jamais : le store ne lui remet que `withoutPosition`, et le rattrapage de la connexion la rend.
/// L'ancienne copie rangée dans `UserDefaults` (sauvegardée, elle) est effacée à la construction.
public struct FileFallStatePersistence: FallStatePersisting {
    public static let fileName = "fall-states.json"
    public static let legacyDefaultsKey = "me.meeshy.fall.states"

    private let directory: URL

    public init(directory: URL, legacyDefaults: UserDefaults? = .standard) {
        self.directory = directory
        legacyDefaults?.removeObject(forKey: Self.legacyDefaultsKey)
    }

    /// `Application Support/me.meeshy.fall/`.
    public static func applicationSupport() -> FileFallStatePersistence {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return FileFallStatePersistence(directory: base.appendingPathComponent("me.meeshy.fall", isDirectory: true))
    }

    private var file: URL { directory.appendingPathComponent(Self.fileName) }

    public func load() -> [FallState] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        return (try? JSONDecoder().decode([FallState].self, from: data)) ?? []
    }

    public func save(_ states: [FallState]) {
        guard !states.isEmpty, let data = try? JSONEncoder().encode(states.map(\.withoutPosition)) else {
            return forget()
        }
        do {
            try prepareDirectory()
            try data.write(to: file, options: [.atomic, .completeFileProtection])
        } catch {
            forget()
        }
    }

    private func forget() {
        try? FileManager.default.removeItem(at: file)
    }

    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = directory
        try url.setResourceValues(values)
    }
}
