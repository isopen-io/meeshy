import Foundation
import os

// MARK: - Pure model

/// Les stories qu'un compte a VUES sur cet appareil, avec le moment de la vue.
///
/// #9804 — l'état « vu » ne vivait que comme un drapeau DANS l'instantané du
/// tray (`recent_tray_v2`). Tout chemin qui reconstruit ce tray depuis le
/// serveur sans le tray en mémoire pour référence le perdait : le
/// préchargement de la liste des conversations qui réécrit la même clé, un
/// démarrage à froid sur cache vide ou périmé, un tirer-pour-rafraîchir qui
/// l'invalide. Tant que le serveur n'a pas reçu la vue (hors ligne, file
/// d'envoi en attente) — ou ne la recevra jamais (ses propres stories : le
/// serveur n'enregistre pas la vue de l'auteur) — l'anneau épais revenait.
///
/// Ce registre est une source DISTINCTE de l'instantané : aucun réécrivain du
/// tray ne peut l'effacer. Brique pure — un identifiant opaque et une date ;
/// la règle « quand une vue locale cède » (édition du contenu après la vue)
/// reste à l'appelant.
public struct StoryViewedEntries: Codable, Equatable, Sendable {
    /// `ownerId → storyId → viewedAt`. Le propriétaire sépare les comptes
    /// d'un même appareil : la vue d'un compte n'éteint jamais l'anneau d'un
    /// autre.
    public private(set) var byOwner: [String: [String: Date]]

    public init(byOwner: [String: [String: Date]] = [:]) {
        self.byOwner = byOwner
    }

    public func viewedStories(ownerId: String) -> [String: Date] {
        byOwner[ownerId] ?? [:]
    }

    /// Garde la vue la PLUS RÉCENTE : revoir une story après son édition la
    /// rend de nouveau vue.
    public func recording(storyId: String, ownerId: String, at date: Date) -> StoryViewedEntries {
        var stories = byOwner[ownerId] ?? [:]
        if let existing = stories[storyId], existing >= date { return self }
        stories[storyId] = date
        var copy = byOwner
        copy[ownerId] = stories
        return StoryViewedEntries(byOwner: copy)
    }

    /// Oublie les vues plus anciennes que `cutoff` — une story vit 20 h, le
    /// registre n'a rien à garder au-delà de la rétention.
    public func pruned(olderThan cutoff: Date) -> StoryViewedEntries {
        let kept = byOwner.compactMapValues { stories -> [String: Date]? in
            let alive = stories.filter { $0.value >= cutoff }
            return alive.isEmpty ? nil : alive
        }
        return StoryViewedEntries(byOwner: kept)
    }
}

// MARK: - Contract

public protocol StoryViewedLedgerProviding: AnyObject, Sendable {
    func record(storyId: String, ownerId: String, at date: Date)
    func viewedStories(ownerId: String) -> [String: Date]
}

// MARK: - Persistent store

/// Registre durable des stories vues, adossé à `UserDefaults` (même régime que
/// `MediaConsumptionStore` : un état de lecture, non secret). L'écriture est
/// SYNCHRONE : la vue est sur disque avant que l'utilisateur puisse tuer l'app.
public final class StoryViewedLedger: StoryViewedLedgerProviding, @unchecked Sendable {
    public static let shared = StoryViewedLedger()

    public static let storageKey = "me.meeshy.storyViewedLedger"

    /// Au-delà, une story est expirée depuis longtemps (20 h de vie) et le
    /// cache du tray lui-même ne la garde pas plus (`CachePolicy.stories`).
    public static let retention: TimeInterval = 72 * 3600

    private let userDefaults: UserDefaults
    private let key: String
    private let now: @Sendable () -> Date
    private let lock = NSLock()
    private var entries: StoryViewedEntries

    public init(
        userDefaults: UserDefaults = .standard,
        key: String = StoryViewedLedger.storageKey,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.userDefaults = userDefaults
        self.key = key
        self.now = now
        self.entries = Self.load(from: userDefaults, key: key)
            .pruned(olderThan: now().addingTimeInterval(-Self.retention))
    }

    public func record(storyId: String, ownerId: String, at date: Date) {
        lock.lock()
        defer { lock.unlock() }
        let updated = entries
            .recording(storyId: storyId, ownerId: ownerId, at: date)
            .pruned(olderThan: now().addingTimeInterval(-Self.retention))
        guard updated != entries else { return }
        entries = updated
        persist(updated)
    }

    public func viewedStories(ownerId: String) -> [String: Date] {
        lock.lock()
        defer { lock.unlock() }
        return entries.viewedStories(ownerId: ownerId)
    }

    // MARK: - Persistence

    private static func load(from userDefaults: UserDefaults, key: String) -> StoryViewedEntries {
        guard let data = userDefaults.data(forKey: key) else { return StoryViewedEntries() }
        do {
            return try JSONDecoder().decode(StoryViewedEntries.self, from: data)
        } catch {
            Logger.cache.error("StoryViewedLedger unreadable, starting empty: \(error.localizedDescription, privacy: .public)")
            return StoryViewedEntries()
        }
    }

    private func persist(_ value: StoryViewedEntries) {
        do {
            userDefaults.set(try JSONEncoder().encode(value), forKey: key)
        } catch {
            Logger.cache.error("StoryViewedLedger write failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
