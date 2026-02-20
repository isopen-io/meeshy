import Foundation
import UIKit
import MeeshySDK

/// Unified media cache with two tiers: NSCache (memory) + FileManager (disk).
/// Supports images, audio, video, and any binary data keyed by URL string.
actor MediaCacheManager {
    static let shared = MediaCacheManager()

    // MARK: - Memory Cache

    private let memoryCache = NSCache<NSString, NSData>()

    // MARK: - Disk Cache

    private let diskCacheURL: URL
    private let fileManager = FileManager.default
    /// Maximum disk cache size in bytes (200 MB)
    private let maxDiskCacheSize: Int = 200 * 1024 * 1024
    /// Evict files older than 7 days
    private let maxAge: TimeInterval = 7 * 24 * 60 * 60

    // MARK: - In-flight downloads (prevent duplicate requests)

    private var inFlightTasks: [String: Task<Data, Error>] = [:]

    // MARK: - Init

    private init() {
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        diskCacheURL = caches.appendingPathComponent("MediaCache", isDirectory: true)
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)

        memoryCache.countLimit = 150
        memoryCache.totalCostLimit = 80 * 1024 * 1024 // 80 MB memory limit
    }

    // MARK: - Public API

    /// Fetch data for a URL, returning from cache if available, otherwise downloading.
    func data(for urlString: String) async throws -> Data {
        let resolved = resolveURL(urlString)
        let key = cacheKey(for: resolved)

        // 1. Memory cache
        if let cached = memoryCache.object(forKey: key as NSString) {
            return cached as Data
        }

        // 2. Disk cache
        let diskPath = diskFilePath(for: key)
        if fileManager.fileExists(atPath: diskPath.path) {
            let data = try Data(contentsOf: diskPath)
            memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
            // Touch file to update access date
            try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: diskPath.path)
            return data
        }

        // 3. De-duplicate in-flight downloads
        if let existing = inFlightTasks[key] {
            return try await existing.value
        }

        let task = Task<Data, Error> {
            guard let url = URL(string: resolved) else {
                throw URLError(.badURL)
            }
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            return data
        }

        inFlightTasks[key] = task

        do {
            let data = try await task.value
            inFlightTasks[key] = nil

            // Store in both caches
            memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
            try? data.write(to: diskFilePath(for: key), options: .atomic)

            return data
        } catch {
            inFlightTasks[key] = nil
            throw error
        }
    }

    /// Convenience: load a UIImage from a URL string.
    func image(for urlString: String) async throws -> UIImage {
        let data = try await data(for: urlString)
        guard let image = UIImage(data: data) else {
            throw URLError(.cannotDecodeContentData)
        }
        return image
    }

    /// Convenience: get the local file URL for cached media (audio/video playback).
    /// Downloads if not cached, returns local disk path.
    func localFileURL(for urlString: String) async throws -> URL {
        let key = cacheKey(for: urlString)
        let diskPath = diskFilePath(for: key)

        if fileManager.fileExists(atPath: diskPath.path) {
            try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: diskPath.path)
            return diskPath
        }

        // Download and cache
        let data = try await self.data(for: urlString)
        // File is already written by data(for:), return path
        _ = data
        return diskPath
    }

    /// Pre-cache a URL (fire-and-forget).
    func prefetch(_ urlString: String) {
        Task {
            _ = try? await data(for: urlString)
        }
    }

    /// Check if a URL is already cached (memory or disk).
    func isCached(_ urlString: String) -> Bool {
        let key = cacheKey(for: urlString)
        if memoryCache.object(forKey: key as NSString) != nil { return true }
        return fileManager.fileExists(atPath: diskFilePath(for: key).path)
    }

    /// Store data directly into the cache (useful for locally generated content).
    func store(_ data: Data, for urlString: String) {
        let key = cacheKey(for: urlString)
        memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
        try? data.write(to: diskFilePath(for: key), options: .atomic)
    }

    /// Remove a specific entry from both caches.
    func remove(for urlString: String) {
        let key = cacheKey(for: urlString)
        memoryCache.removeObject(forKey: key as NSString)
        try? fileManager.removeItem(at: diskFilePath(for: key))
    }

    /// Clear all caches.
    func clearAll() {
        memoryCache.removeAllObjects()
        try? fileManager.removeItem(at: diskCacheURL)
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)
    }

    /// Evict old and over-budget files from disk cache. Call periodically (e.g., app background).
    func evictExpired() {
        guard let enumerator = fileManager.enumerator(
            at: diskCacheURL,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        let cutoff = Date().addingTimeInterval(-maxAge)
        var totalSize: Int = 0
        var files: [(url: URL, date: Date, size: Int)] = []

        while let fileURL = enumerator.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let modDate = values.contentModificationDate,
                  let size = values.fileSize else { continue }

            if modDate < cutoff {
                try? fileManager.removeItem(at: fileURL)
            } else {
                files.append((fileURL, modDate, size))
                totalSize += size
            }
        }

        // If still over budget, evict oldest first
        if totalSize > maxDiskCacheSize {
            let sorted = files.sorted { $0.date < $1.date }
            for file in sorted {
                guard totalSize > maxDiskCacheSize else { break }
                try? fileManager.removeItem(at: file.url)
                totalSize -= file.size
            }
        }
    }

    // MARK: - URL Resolution

    private func resolveURL(_ urlString: String) -> String {
        // Already absolute
        if urlString.hasPrefix("http://") || urlString.hasPrefix("https://") {
            return urlString
        }
        // Relative with leading slash
        if urlString.hasPrefix("/") {
            return MeeshyConfig.shared.serverOrigin + urlString
        }
        // Relative path without leading slash (legacy: "2025/12/...")
        return MeeshyConfig.shared.serverOrigin + "/" + urlString
    }

    // MARK: - Helpers

    private func cacheKey(for urlString: String) -> String {
        // SHA256-like simple hash to avoid path issues
        let hash = urlString.utf8.reduce(into: UInt64(5381)) { result, byte in
            result = result &* 33 &+ UInt64(byte)
        }
        // Keep extension for AVPlayer compatibility
        let ext = URL(string: urlString)?.pathExtension ?? ""
        return ext.isEmpty ? "\(hash)" : "\(hash).\(ext)"
    }

    private func diskFilePath(for key: String) -> URL {
        diskCacheURL.appendingPathComponent(key)
    }
}
