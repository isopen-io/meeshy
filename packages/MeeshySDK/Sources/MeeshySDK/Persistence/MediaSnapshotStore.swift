import Foundation
import os

private let mediaSnapshotLog = Logger(subsystem: "com.meeshy.sdk", category: "media-snapshot")

/// Local media snapshot store — saves media data pre-upload for instant display
public actor MediaSnapshotStore {
    public static let shared = MediaSnapshotStore()

    private let baseDir: URL

    public init(baseDir: URL? = nil) {
        let dir = baseDir ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy_media_snapshots")
        self.baseDir = dir
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            // Sans ce dossier, chaque `save(data:…)` échouera : les médias
            // n'auront pas d'aperçu local avant upload.
            mediaSnapshotLog.error("Snapshot directory unavailable, pre-upload previews disabled: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Save a media snapshot (image/video data) for a given message localId
    public func save(data: Data, forMessageId localId: String, type: String) throws -> URL {
        let fileName = "\(localId).\(fileExtension(for: type))"
        let url = baseDir.appendingPathComponent(fileName)
        try data.write(to: url)
        return url
    }

    /// Get the snapshot URL for a given message
    public func snapshotURL(forMessageId localId: String, type: String) -> URL? {
        let fileName = "\(localId).\(fileExtension(for: type))"
        let url = baseDir.appendingPathComponent(fileName)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Remove snapshot after successful upload
    public func remove(forMessageId localId: String, type: String) {
        let fileName = "\(localId).\(fileExtension(for: type))"
        let url = baseDir.appendingPathComponent(fileName)
        Self.removeSnapshot(at: url, context: "post-upload cleanup")
    }

    /// Clean all snapshots older than given interval
    public func cleanOlderThan(_ interval: TimeInterval) {
        let files: [URL]
        do {
            files = try FileManager.default.contentsOfDirectory(
                at: baseDir, includingPropertiesForKeys: [.creationDateKey]
            )
        } catch CocoaError.fileReadNoSuchFile {
            return  // Rien n'a encore été écrit — cas nominal.
        } catch {
            mediaSnapshotLog.error("Snapshot sweep could not list the directory, old files retained: \(error.localizedDescription, privacy: .public)")
            return
        }

        let cutoff = Date().addingTimeInterval(-interval)
        for file in files {
            guard let attrs = try? file.resourceValues(forKeys: [.creationDateKey]),
                  let created = attrs.creationDate,
                  created < cutoff else { continue }
            Self.removeSnapshot(at: file, context: "age sweep")
        }
    }

    /// Deletes one snapshot. A missing file is nominal; anything else means
    /// the bytes stay in the cache directory and must be traceable.
    private static func removeSnapshot(at url: URL, context: String) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch CocoaError.fileNoSuchFile {
            // Déjà supprimé.
        } catch {
            mediaSnapshotLog.error("\(context, privacy: .public): snapshot not removed, disk space retained: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func fileExtension(for type: String) -> String {
        switch type {
        case "image": return "jpg"
        case "video": return "mp4"
        case "audio": return "m4a"
        default: return "bin"
        }
    }
}
