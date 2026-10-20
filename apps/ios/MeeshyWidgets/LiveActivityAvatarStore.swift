import Foundation
import ImageIO
import UniformTypeIdentifiers

nonisolated enum LiveActivityAvatarStoreError: Error, Equatable {
    case invalidActivityID
    case undecodableImage
    case encodingFailed
}

nonisolated struct LiveActivityAvatarStore: Sendable {
    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let maxPixelSize = 132
    private static let directoryName = "LiveActivityAvatars"
    private static let maxIdentifierLength = 64

    let directory: URL

    init(directory: URL) {
        self.directory = directory
    }

    static func appGroup() -> Self? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
            .map { Self(directory: $0.appendingPathComponent(directoryName, isDirectory: true)) }
    }

    func fileURL(forActivityID activityID: String) -> URL? {
        guard Self.isValid(activityID) else { return nil }
        return directory.appendingPathComponent("\(activityID).png", isDirectory: false)
    }

    func write(imageData: Data, forActivityID activityID: String) throws {
        guard let target = fileURL(forActivityID: activityID) else {
            throw LiveActivityAvatarStoreError.invalidActivityID
        }
        let png = try Self.thumbnailPNG(from: imageData)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try png.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func thumbnail(forActivityID activityID: String) -> CGImage? {
        guard let url = fileURL(forActivityID: activityID),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }

    func remove(forActivityID activityID: String) {
        guard let url = fileURL(forActivityID: activityID) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    func removeAll(keeping kept: Set<String>) {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        files
            .filter { $0.pathExtension == "png" && !kept.contains($0.deletingPathExtension().lastPathComponent) }
            .forEach { try? FileManager.default.removeItem(at: $0) }
    }

    private static func isValid(_ activityID: String) -> Bool {
        let scalars = activityID.unicodeScalars
        guard (1...maxIdentifierLength).contains(scalars.count) else { return false }
        return scalars.allSatisfy { scalar in
            let value = scalar.value
            return (48...57).contains(value) || (65...90).contains(value) || (97...122).contains(value) || value == 45
        }
    }

    private static func thumbnailPNG(from imageData: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(imageData as CFData, nil) else {
            throw LiveActivityAvatarStoreError.undecodableImage
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw LiveActivityAvatarStoreError.undecodableImage
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil) else {
            throw LiveActivityAvatarStoreError.encodingFailed
        }
        CGImageDestinationAddImage(destination, thumbnail, nil)
        guard CGImageDestinationFinalize(destination) else { throw LiveActivityAvatarStoreError.encodingFailed }
        return output as Data
    }
}
