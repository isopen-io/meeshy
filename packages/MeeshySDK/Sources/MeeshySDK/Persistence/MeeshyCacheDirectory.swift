import Foundation

/// Single source of the `Documents/meeshy_cache` folder shared by the persistent queues.
public enum MeeshyCacheDirectory {
    public static let folderName = "meeshy_cache"

    /// The folder URL, without touching the disk (read paths).
    public static var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(folderName, isDirectory: true)
    }

    /// The folder URL, created on demand (write paths). A creation failure is
    /// reported to `onFailure` and the URL is still returned, as before.
    public static func ensured(onFailure: (Error) -> Void = { _ in }) -> URL {
        let directory = url
        guard !FileManager.default.fileExists(atPath: directory.path) else { return directory }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            onFailure(error)
        }
        return directory
    }
}
