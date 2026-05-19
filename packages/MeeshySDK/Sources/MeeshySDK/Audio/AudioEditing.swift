import Foundation

// MARK: - Audio Edit Operation

/// A single, reversible, non-destructive editing step applied to an audio file.
///
/// Operations are pure value descriptions — they carry no audio data. The
/// `AudioEditEngine` turns an operation into a concrete rendered file, and
/// `AudioEditDocument` keeps the ordered history so any step can be undone.
public enum AudioEditOperation: Sendable, Equatable, Codable {
    /// The untouched source. Always version 0 of a document.
    case original
    /// Keep only `[start, end]` (seconds), discard the rest.
    case trim(start: TimeInterval, end: TimeInterval)
    /// Remove `[start, end]` (seconds), keeping the head and tail.
    case removeRange(start: TimeInterval, end: TimeInterval)
    /// Apply a volume fade at the start and/or end.
    case fade(fadeIn: Bool, fadeOut: Bool)
    /// Re-time playback. `rate` is a multiplier (0.25…3.0); pitch is preserved.
    case speed(rate: Double)
    /// Scale loudness. `multiplier` is linear gain (0…4); 1.0 is unchanged.
    case gain(multiplier: Double)

    /// `true` when the operation would leave the audio byte-identical.
    public var isIdentity: Bool {
        switch self {
        case .original:
            return true
        case .fade(let fadeIn, let fadeOut):
            return !fadeIn && !fadeOut
        case .speed(let rate):
            return abs(rate - 1.0) < 0.001
        case .gain(let multiplier):
            return abs(multiplier - 1.0) < 0.001
        case .trim, .removeRange:
            return false
        }
    }
}

// MARK: - Audio Edit Version

/// One node in the non-destructive edit history: a rendered audio file plus
/// the operation that produced it. Version 0 is always the preserved original.
public struct AudioEditVersion: Identifiable, Sendable, Codable, Equatable {
    public let id: UUID
    /// File name relative to the owning session directory. Stored relative so
    /// the manifest survives the temp directory being relocated between
    /// app launches (crash recovery).
    public let fileName: String
    public let duration: TimeInterval
    public let operation: AudioEditOperation
    public let createdAt: Date

    public init(id: UUID = UUID(),
                fileName: String,
                duration: TimeInterval,
                operation: AudioEditOperation,
                createdAt: Date = Date()) {
        self.id = id
        self.fileName = fileName
        self.duration = duration
        self.operation = operation
        self.createdAt = createdAt
    }
}

// MARK: - Audio Edit Document

/// The non-destructive editing model for a single audio file.
///
/// Holds an ordered list of `AudioEditVersion`s with a `cursor` pointing at the
/// active one. The original (version 0) is never mutated or removed, so the
/// user can always return to it. Committing a new edit while the cursor is not
/// at the tip discards the orphaned redo branch (its files are returned so the
/// caller can delete them). The whole document is `Codable` so it can be
/// auto-saved to disk for crash recovery.
public struct AudioEditDocument: Sendable, Codable, Equatable {
    public let sessionID: UUID
    public private(set) var versions: [AudioEditVersion]
    public private(set) var cursor: Int

    public init(sessionID: UUID = UUID(), original: AudioEditVersion) {
        self.sessionID = sessionID
        self.versions = [original]
        self.cursor = 0
    }

    private enum CodingKeys: String, CodingKey {
        case sessionID, versions, cursor
    }

    /// Validating decoder for crash-recovery: a corrupt or hand-edited manifest
    /// must never decode into an empty/out-of-bounds document that would then
    /// trap on `active`/`original`.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sessionID = try container.decode(UUID.self, forKey: .sessionID)
        let decodedVersions = try container.decode([AudioEditVersion].self, forKey: .versions)
        guard !decodedVersions.isEmpty else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "AudioEditDocument requires at least one version"
                )
            )
        }
        versions = decodedVersions
        let decodedCursor = try container.decode(Int.self, forKey: .cursor)
        cursor = min(max(0, decodedCursor), decodedVersions.count - 1)
    }

    /// The version currently presented to the user.
    public var active: AudioEditVersion { versions[cursor] }
    /// The preserved, never-mutated source.
    public var original: AudioEditVersion { versions[0] }

    public var canUndo: Bool { cursor > 0 }
    public var canRedo: Bool { cursor < versions.count - 1 }
    /// `true` when the active version differs from the original.
    public var isModified: Bool { cursor > 0 }
    /// `true` when at least one edit has ever been applied.
    public var hasHistory: Bool { versions.count > 1 }

    /// Appends a freshly rendered version and moves the cursor to it.
    ///
    /// Any versions ahead of the cursor (a redo branch the user abandoned by
    /// editing) are dropped and returned so the caller can delete their files.
    @discardableResult
    public mutating func commit(_ version: AudioEditVersion) -> [AudioEditVersion] {
        let orphanStart = cursor + 1
        let discarded = orphanStart <= versions.count - 1
            ? Array(versions[orphanStart...])
            : []
        if orphanStart <= versions.count - 1 {
            versions.removeSubrange(orphanStart...)
        }
        versions.append(version)
        cursor = versions.count - 1
        return discarded
    }

    public mutating func undo() {
        if canUndo { cursor -= 1 }
    }

    public mutating func redo() {
        if canRedo { cursor += 1 }
    }

    /// Moves the cursor directly to a version by id (used by the history list).
    public mutating func moveCursor(to versionID: UUID) {
        if let index = versions.firstIndex(where: { $0.id == versionID }) {
            cursor = index
        }
    }

    /// File names of every version except `keep` — used to clean up the
    /// session directory once the active audio is finalized.
    public func fileNames(excluding keep: AudioEditVersion) -> [String] {
        versions.filter { $0.id != keep.id }.map(\.fileName)
    }
}
