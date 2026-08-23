import Foundation
import os
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
        let keysToFetch = keys.filter { cache.get($0) == nil && !inFlight.contains($0) }
            .prefix(maxConcurrent)

        for key in keysToFetch { inFlight.insert(key) }

        // Compute paths before entering the task group to avoid actor isolation issues
        let keyPathPairs = keysToFetch.map { ($0, thumbnailPath(forKey: $0)) }

        await withTaskGroup(of: Void.self) { group in
            for (key, path) in keyPathPairs {
                group.addTask { [cache] in
                    guard FileManager.default.fileExists(atPath: path.path) else { return }
                    guard let data = try? Data(contentsOf: path, options: .mappedIfSafe) else { return }
                    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return }
                    let options: [CFString: Any] = [
                        kCGImageSourceThumbnailMaxPixelSize: 300,
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceShouldCacheImmediately: true
                    ]
                    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return }
                    cache.set(cgImage, forKey: key)
                }
            }
        }

        for key in keysToFetch { inFlight.remove(key) }
    }

    /// Save raw thumbnail data to disk
    public func saveToDisk(data: Data, forKey key: String) {
        let path = thumbnailPath(forKey: key)
        do {
            try data.write(to: path)
        } catch {
            // Le dossier a pu être purgé par l'OS pendant la session : on le
            // recrée et on retente une fois avant d'abandonner.
            FileManager.default.createDirectoryLogging(at: Self.directory, context: "thumbnail cache dir")
            do {
                try data.write(to: path)
            } catch {
                // La miniature sera re-décodée depuis l'original à chaque affichage.
                Logger.cache.error("Thumbnail not cached to disk, it will be re-decoded every time: \(error.localizedDescription, privacy: .public)")
            }
        }
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

    /// Dossier créé UNE fois (au premier accès) — l'ancien chemin recréait le
    /// répertoire (syscall) à chaque résolution de miniature, y compris pendant
    /// le scroll. `saveToDisk` sait le recréer si l'OS purge Caches en cours de
    /// session.
    nonisolated private static let directory: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy_thumbnails")
        FileManager.default.createDirectoryLogging(at: dir, context: "thumbnail cache dir")
        return dir
    }()

    /// Mémo `key → nom de fichier` (SHA-256 hex complet, format historique des
    /// fichiers déjà présents sur les appareils — ne jamais le changer).
    /// Pattern `DiskCacheStore.fileKeyCache`.
    nonisolated(unsafe) private static let fileNameCache: NSCache<NSString, NSString> = {
        let cache = NSCache<NSString, NSString>()
        cache.countLimit = 4000
        return cache
    }()

    private func thumbnailPath(forKey key: String) -> URL {
        let cacheKey = key as NSString
        if let cached = Self.fileNameCache.object(forKey: cacheKey) {
            return Self.directory.appendingPathComponent(cached as String)
        }
        let hash = SHA256.hash(data: Data(key.utf8)).compactMap { String(format: "%02x", $0) }.joined()
        let fileName = hash + ".jpg"
        Self.fileNameCache.setObject(fileName as NSString, forKey: cacheKey)
        return Self.directory.appendingPathComponent(fileName)
    }
}
