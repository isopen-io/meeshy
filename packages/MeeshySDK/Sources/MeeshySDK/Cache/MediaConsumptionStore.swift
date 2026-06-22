import Foundation

// MARK: - Pure model (testable without UserDefaults)

/// Immutable snapshot of how far the local user has consumed each media
/// attachment — the persisted "at-rest" progress used to tint a voice note's
/// waveform or a video's progress bar BEFORE playback starts. Distinct from
/// `AudioPlaybackPositions` (resume-where-you-stopped): a consumption entry is
/// **monotonic** (it only grows) and is **kept after completion** so a fully
/// played media keeps reading as fully consumed.
///
/// Building block only — keyed by an opaque `attachmentId`. No Meeshy product
/// rule, no singleton lookup, no "when to tint" decision lives here (that
/// belongs to the player view). Stays in the SDK core per the placement table
/// ("Stores de préférences" → SDK).
public struct MediaConsumptions: Codable, Equatable, Sendable {
    public struct Entry: Codable, Equatable, Sendable {
        /// Highest playback fraction reached, clamped to `0...1`.
        public let fraction: Double
        /// `true` once the media was played to its natural end. Sticky — a
        /// later partial re-listen never flips it back to `false`.
        public let complete: Bool
        /// Wall-clock time of the last write — used as the LRU key for pruning.
        public let updatedAt: Date

        public init(fraction: Double, complete: Bool, updatedAt: Date) {
            self.fraction = fraction
            self.complete = complete
            self.updatedAt = updatedAt
        }
    }

    public private(set) var entries: [String: Entry]

    public init(entries: [String: Entry] = [:]) {
        self.entries = entries
    }

    public func entry(for attachmentId: String) -> Entry? {
        entries[attachmentId]
    }

    public func fraction(for attachmentId: String) -> Double? {
        entries[attachmentId]?.fraction
    }

    /// Records progress for `attachmentId`, keeping the MAX fraction ever seen
    /// and OR-ing the `complete` flag. `fraction` is clamped to `0...1`; a
    /// `complete: true` write also floors the stored fraction at `1` so a
    /// finished media always reads as fully consumed regardless of the reported
    /// position.
    public func recording(
        fraction: Double,
        complete: Bool,
        for attachmentId: String,
        now: Date = Date()
    ) -> MediaConsumptions {
        let clamped = max(0, min(1, fraction))
        let existing = entries[attachmentId]
        let mergedComplete = complete || (existing?.complete ?? false)
        let candidate = mergedComplete ? 1 : clamped
        let mergedFraction = max(candidate, existing?.fraction ?? 0)
        var copy = entries
        copy[attachmentId] = Entry(fraction: mergedFraction, complete: mergedComplete, updatedAt: now)
        return MediaConsumptions(entries: copy)
    }

    public func removing(_ attachmentId: String) -> MediaConsumptions {
        guard entries[attachmentId] != nil else { return self }
        var copy = entries
        copy.removeValue(forKey: attachmentId)
        return MediaConsumptions(entries: copy)
    }

    /// Caps the dictionary at `max` entries, evicting the least-recently
    /// updated ones first. Returns `self` untouched when already within budget.
    /// Ties on `updatedAt` break on the key so eviction is deterministic.
    public func pruned(max: Int) -> MediaConsumptions {
        guard entries.count > max, max >= 0 else { return self }
        let kept = entries
            .sorted { lhs, rhs in
                if lhs.value.updatedAt != rhs.value.updatedAt {
                    return lhs.value.updatedAt > rhs.value.updatedAt
                }
                return lhs.key > rhs.key
            }
            .prefix(max)
        return MediaConsumptions(entries: Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0.value) }))
    }
}

// MARK: - Persistent store

/// Persists per-attachment consumption progress locally so a bubble can tint a
/// voice note's waveform / a video's progress bar to the user's last position
/// at a glance — across scroll and app relaunches. Backed by `UserDefaults`
/// (non-sensitive playback state).
///
/// Thin storage layer: it stores and retrieves opaque `attachmentId → progress`
/// pairs. The decision of *how* to render the tint is the player view's, not
/// this store's.
@MainActor
public final class MediaConsumptionStore {
    public static let shared = MediaConsumptionStore()

    /// Upper bound on remembered entries. Beyond this, the least-recently
    /// updated ones are evicted on the next write. Spans realistic media
    /// backlogs across conversations without growing the plist unbounded.
    public static let maxEntries = 1000

    public static let storageKey = "me.meeshy.mediaConsumption"

    private let userDefaults: UserDefaults
    private let key: String
    private var consumptions: MediaConsumptions

    public init(
        userDefaults: UserDefaults = .standard,
        key: String = MediaConsumptionStore.storageKey
    ) {
        self.userDefaults = userDefaults
        self.key = key
        self.consumptions = Self.load(from: userDefaults, key: key)
    }

    public func consumption(for attachmentId: String) -> MediaConsumptions.Entry? {
        consumptions.entry(for: attachmentId)
    }

    public func fraction(for attachmentId: String) -> Double? {
        consumptions.fraction(for: attachmentId)
    }

    public func record(fraction: Double, complete: Bool, for attachmentId: String) {
        let updated = consumptions
            .recording(fraction: fraction, complete: complete, for: attachmentId)
            .pruned(max: Self.maxEntries)
        guard updated != consumptions else { return }
        consumptions = updated
        persist()
    }

    public func clear(for attachmentId: String) {
        let updated = consumptions.removing(attachmentId)
        guard updated != consumptions else { return }
        consumptions = updated
        persist()
    }

    // MARK: - Persistence

    private static func load(from userDefaults: UserDefaults, key: String) -> MediaConsumptions {
        guard let data = userDefaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode(MediaConsumptions.self, from: data) else {
            return MediaConsumptions()
        }
        return decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(consumptions) else { return }
        userDefaults.set(data, forKey: key)
    }
}
