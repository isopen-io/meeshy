import Foundation

/// Saves a media file into the app's Documents directory — surfaced in the
/// iOS Files app under "On My iPhone → Meeshy" (the app's Info.plist carries
/// `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`).
///
/// Stateless. Used to save audio and documents from the full-screen media
/// viewers in one tap, without a share-sheet detour. Image and video keep
/// going straight to the Photos library via `PhotoLibraryManager`.
public enum MediaFileSaver {

    public enum SaveError: Error, Equatable {
        case sourceMissing
    }

    /// The app's Documents directory — visible in the Files app.
    public static var documentsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /// Copies `source` into `directory` (Documents by default). Never
    /// overwrites: on a name collision a numeric suffix is appended
    /// (`clip.mp4` → `clip 2.mp4`). Returns the URL of the saved copy.
    @discardableResult
    public static func save(
        _ source: URL,
        preferredName: String? = nil,
        into directory: URL = documentsDirectory
    ) throws -> URL {
        guard FileManager.default.fileExists(atPath: source.path) else {
            throw SaveError.sourceMissing
        }
        let fileName = resolvedFileName(
            preferredName: preferredName,
            sourceName: source.lastPathComponent,
            sourceExtension: source.pathExtension
        )
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = availableURL(for: fileName, in: directory)
        try FileManager.default.copyItem(at: source, to: destination)
        return destination
    }

    /// Builds a safe file name: prefers `preferredName` when non-empty, strips
    /// path separators, and guarantees the file keeps an extension.
    static func resolvedFileName(
        preferredName: String?,
        sourceName: String,
        sourceExtension: String
    ) -> String {
        let candidate = (preferredName?.isEmpty == false ? preferredName! : sourceName)
        let cleaned = candidate
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let base = cleaned.isEmpty ? "media" : cleaned
        if (base as NSString).pathExtension.isEmpty, !sourceExtension.isEmpty {
            return "\(base).\(sourceExtension)"
        }
        return base
    }

    /// First non-colliding URL for `fileName` in `directory` — appends
    /// ` 2`, ` 3`, … before the extension when a file already exists.
    static func availableURL(for fileName: String, in directory: URL) -> URL {
        let first = directory.appendingPathComponent(fileName)
        guard FileManager.default.fileExists(atPath: first.path) else { return first }
        let name = fileName as NSString
        let stem = name.deletingPathExtension
        let ext = name.pathExtension
        var index = 2
        while true {
            let candidate = ext.isEmpty ? "\(stem) \(index)" : "\(stem) \(index).\(ext)"
            let url = directory.appendingPathComponent(candidate)
            if !FileManager.default.fileExists(atPath: url.path) { return url }
            index += 1
        }
    }
}
