import Foundation

/// Persists in-progress `VideoEditDocument`s so an edit survives an
/// interruption (backgrounding, low-memory kill, crash). The editor saves on
/// every committed change and clears the slot once the edit is exported.
///
/// Implemented as an `actor` so concurrent autosaves from the editor never
/// race on the same file.
public actor VideoEditSessionStore {
    public static let shared = VideoEditSessionStore()

    private let directory: URL
    private let fileManager = FileManager.default
    private let maxAge: TimeInterval = 7 * 24 * 3600

    private init() {
        let base = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        directory = base.appendingPathComponent("VideoEditorSessions", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        Task { await pruneExpired() }
    }

    /// Writes the document atomically. Failures are swallowed — autosave is a
    /// best-effort safety net, never a hard dependency.
    public func save(_ document: VideoEditDocument) {
        guard let data = try? JSONEncoder().encode(document) else { return }
        try? data.write(to: fileURL(for: document.sourceURL), options: .atomic)
    }

    /// Returns a previously interrupted session for `sourceURL`, but only if
    /// it actually contains edits worth restoring.
    public func recoverableSession(for sourceURL: URL) -> VideoEditDocument? {
        let url = fileURL(for: sourceURL)
        guard let data = try? Data(contentsOf: url),
              let document = try? JSONDecoder().decode(VideoEditDocument.self, from: data),
              document.sourceURL == sourceURL,
              document.hasEdits else {
            return nil
        }
        return document
    }

    public func clearSession(for sourceURL: URL) {
        try? fileManager.removeItem(at: fileURL(for: sourceURL))
    }

    private func pruneExpired() {
        let cutoff = Date().addingTimeInterval(-maxAge)
        guard let entries = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        ) else { return }
        for entry in entries {
            let modified = (try? entry.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate
            if let modified, modified < cutoff {
                try? fileManager.removeItem(at: entry)
            }
        }
    }

    private func fileURL(for sourceURL: URL) -> URL {
        directory.appendingPathComponent(Self.stableKey(for: sourceURL) + ".json")
    }

    /// Deterministic FNV-1a hash — `URL.hashValue` is per-process randomized
    /// and would break cross-launch recovery.
    private static func stableKey(for url: URL) -> String {
        var hash: UInt64 = 1_469_598_103_934_665_603
        for byte in url.absoluteString.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}
