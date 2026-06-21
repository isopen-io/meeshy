import Foundation

// MARK: - Pure model (testable without UserDefaults)

/// Immutable snapshot of per-attachment playback positions. Pure value type
/// so the prune / set / remove logic is unit-testable in isolation, away from
/// the `UserDefaults`-backed singleton.
///
/// Building block only — keyed by an opaque `attachmentId`. No Meeshy product
/// rule, no singleton lookup, no "when to resume" decision lives here (that
/// belongs to the playback engine). Stays in the SDK core per the placement
/// table ("Stores de préférences" → SDK).
public struct AudioPlaybackPositions: Codable, Equatable, Sendable {
    public struct Entry: Codable, Equatable, Sendable {
        /// Last known elapsed playback time, in seconds.
        public let positionSeconds: TimeInterval
        /// Wall-clock time of the last write — used as the LRU key for pruning.
        public let updatedAt: Date

        public init(positionSeconds: TimeInterval, updatedAt: Date) {
            self.positionSeconds = positionSeconds
            self.updatedAt = updatedAt
        }
    }

    public private(set) var entries: [String: Entry]

    public init(entries: [String: Entry] = [:]) {
        self.entries = entries
    }

    public func position(for attachmentId: String) -> TimeInterval? {
        entries[attachmentId]?.positionSeconds
    }

    public func setting(
        position: TimeInterval,
        for attachmentId: String,
        now: Date = Date()
    ) -> AudioPlaybackPositions {
        var copy = entries
        copy[attachmentId] = Entry(positionSeconds: position, updatedAt: now)
        return AudioPlaybackPositions(entries: copy)
    }

    public func removing(_ attachmentId: String) -> AudioPlaybackPositions {
        guard entries[attachmentId] != nil else { return self }
        var copy = entries
        copy.removeValue(forKey: attachmentId)
        return AudioPlaybackPositions(entries: copy)
    }

    /// Caps the dictionary at `max` entries, evicting the least-recently
    /// updated ones first. Returns `self` untouched when already within budget.
    /// Ties on `updatedAt` (two writes in the same instant) break on the key so
    /// eviction is deterministic rather than dependent on unstable sort order.
    public func pruned(max: Int) -> AudioPlaybackPositions {
        guard entries.count > max, max >= 0 else { return self }
        let kept = entries
            .sorted { lhs, rhs in
                if lhs.value.updatedAt != rhs.value.updatedAt {
                    return lhs.value.updatedAt > rhs.value.updatedAt
                }
                return lhs.key > rhs.key
            }
            .prefix(max)
        return AudioPlaybackPositions(entries: Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0.value) }))
    }
}

// MARK: - Persistent store

/// Persists per-attachment audio playback positions locally so a paused or
/// interrupted voice note resumes where it stopped — across track switches and
/// app relaunches. Backed by `UserDefaults` (non-sensitive playback state).
///
/// Thin storage layer: it stores and retrieves opaque `attachmentId → seconds`
/// pairs. The decision of *whether* to resume (e.g. ignore positions near the
/// end) is the playback engine's, not this store's.
@MainActor
public final class AudioPlaybackPositionStore {
    public static let shared = AudioPlaybackPositionStore()

    /// Upper bound on remembered positions. Beyond this, the least-recently
    /// updated entries are evicted on the next write. Generous enough to span
    /// realistic conversation backlogs without growing the plist unbounded.
    public static let maxEntries = 500

    public static let storageKey = "me.meeshy.audioPlaybackPositions"

    private let userDefaults: UserDefaults
    private let key: String
    private var positions: AudioPlaybackPositions

    public init(
        userDefaults: UserDefaults = .standard,
        key: String = AudioPlaybackPositionStore.storageKey
    ) {
        self.userDefaults = userDefaults
        self.key = key
        self.positions = Self.load(from: userDefaults, key: key)
    }

    public func position(for attachmentId: String) -> TimeInterval? {
        positions.position(for: attachmentId)
    }

    public func save(_ position: TimeInterval, for attachmentId: String) {
        positions = positions
            .setting(position: position, for: attachmentId)
            .pruned(max: Self.maxEntries)
        persist()
    }

    public func clear(for attachmentId: String) {
        let updated = positions.removing(attachmentId)
        guard updated != positions else { return }
        positions = updated
        persist()
    }

    // MARK: - Persistence

    private static func load(from userDefaults: UserDefaults, key: String) -> AudioPlaybackPositions {
        guard let data = userDefaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode(AudioPlaybackPositions.self, from: data) else {
            return AudioPlaybackPositions()
        }
        return decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(positions) else { return }
        userDefaults.set(data, forKey: key)
    }
}
