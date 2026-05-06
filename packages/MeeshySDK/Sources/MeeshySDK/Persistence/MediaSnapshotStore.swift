import Foundation

/// Local media snapshot store — saves media data pre-upload for instant display
public actor MediaSnapshotStore {
    public static let shared = MediaSnapshotStore()

    private let baseDir: URL

    public init(baseDir: URL? = nil) {
        let dir = baseDir ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy_media_snapshots")
        self.baseDir = dir
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
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
        try? FileManager.default.removeItem(at: url)
    }

    /// Clean all snapshots older than given interval
    public func cleanOlderThan(_ interval: TimeInterval) {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: baseDir, includingPropertiesForKeys: [.creationDateKey]
        ) else { return }

        let cutoff = Date().addingTimeInterval(-interval)
        for file in files {
            guard let attrs = try? file.resourceValues(forKeys: [.creationDateKey]),
                  let created = attrs.creationDate,
                  created < cutoff else { continue }
            try? FileManager.default.removeItem(at: file)
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
