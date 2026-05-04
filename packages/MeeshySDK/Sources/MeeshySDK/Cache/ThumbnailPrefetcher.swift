import Foundation
import ImageIO
import CoreGraphics
import CryptoKit

public actor ThumbnailPrefetcher {
    public static let shared = ThumbnailPrefetcher()

    private let cache: DecodedImageCache
    private var inFlight: Set<String> = []
    private let maxConcurrent = 4

    public init(cache: DecodedImageCache = .shared) {
        self.cache = cache
    }

    /// Get a decoded thumbnail — check NSCache first, then disk, then nil
    public func get(key: String) async -> CGImage? {
        if let cached = cache.get(key) { return cached }

        let path = thumbnailPath(forKey: key)
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        return await decodeFromDisk(url: path, cacheKey: key)
    }

    /// Prefetch thumbnails for a batch of keys
    public func prefetchBatch(_ keys: [String]) async {
        await withTaskGroup(of: Void.self) { group in
            var launched = 0
            for key in keys {
                guard cache.get(key) == nil else { continue }
                guard !inFlight.contains(key) else { continue }
                guard launched < maxConcurrent else { break }

                inFlight.insert(key)
                launched += 1

                group.addTask {
                    defer { Task { await self.inFlight.remove(key) } }
                    let path = self.thumbnailPath(forKey: key)
                    guard FileManager.default.fileExists(atPath: path.path) else { return }
                    _ = await self.decodeFromDisk(url: path, cacheKey: key)
                }
            }
        }
    }

    /// Save raw thumbnail data to disk
    public func saveToDisk(data: Data, forKey key: String) {
        let path = thumbnailPath(forKey: key)
        try? data.write(to: path)
    }

    /// Decode from disk via mmap + CGImageSource — NEVER on MainActor
    private func decodeFromDisk(url: URL, cacheKey: String) async -> CGImage? {
        await Task.detached(priority: .utility) { [cache] in
            guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
            guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }

            let options: [CFString: Any] = [
                kCGImageSourceThumbnailMaxPixelSize: 300,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceShouldCacheImmediately: true
            ]

            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
            else { return nil }

            cache.set(cgImage, forKey: cacheKey)
            return cgImage
        }.value
    }

    private func thumbnailPath(forKey key: String) -> URL {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy_thumbnails")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let hash = SHA256.hash(data: Data(key.utf8)).compactMap { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(hash + ".jpg")
    }
}
