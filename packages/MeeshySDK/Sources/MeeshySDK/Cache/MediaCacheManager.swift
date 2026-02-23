import Foundation
import UIKit

/// Unified media cache with two tiers: NSCache (memory) + FileManager (disk).
/// Supports images, audio, video, and any binary data keyed by URL string.
public actor MediaCacheManager {
    public static let shared = MediaCacheManager()

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

    // URLSession with reasonable timeout for media loading
    private let urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        return URLSession(configuration: config)
    }()

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
    public func data(for urlString: String) async throws -> Data {
        let key = cacheKey(for: urlString)

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
            do {
                return try await existing.value
            } catch is CancellationError {
                // Previous caller was cancelled; remove stale task and retry
                inFlightTasks[key] = nil
            } catch {
                throw error
            }
        }

        let task = Task.detached { [urlSession] () -> Data in
            guard let url = URL(string: urlString) else {
                throw URLError(.badURL)
            }
            let (data, response) = try await urlSession.data(from: url)
            if let http = response as? HTTPURLResponse {
                guard (200...299).contains(http.statusCode) else {
                    throw URLError(.badServerResponse)
                }
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
        } catch is CancellationError {
            // Don't remove the in-flight task if WE were cancelled but the download is still running
            throw CancellationError()
        } catch {
            inFlightTasks[key] = nil
            throw error
        }
    }

    /// Convenience: load a UIImage from a URL string.
    /// Validates decoded image; evicts corrupted cache entries and re-downloads once.
    public func image(for urlString: String) async throws -> UIImage {
        let data = try await data(for: urlString)
        if let image = UIImage(data: data) { return image }

        // Data exists but can't decode as image — corrupted cache entry
        let key = cacheKey(for: urlString)
        memoryCache.removeObject(forKey: key as NSString)
        try? fileManager.removeItem(at: diskFilePath(for: key))
        inFlightTasks[key] = nil

        // Re-download from network
        let freshData = try await self.data(for: urlString)
        guard let image = UIImage(data: freshData) else {
            throw URLError(.cannotDecodeContentData)
        }
        return image
    }

    /// Convenience: get the local file URL for cached media (audio/video playback).
    /// Downloads if not cached, returns local disk path.
    public func localFileURL(for urlString: String) async throws -> URL {
        let key = cacheKey(for: urlString)
        let diskPath = diskFilePath(for: key)

        if fileManager.fileExists(atPath: diskPath.path) {
            try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: diskPath.path)
            return diskPath
        }

        // Download and cache
        let data = try await self.data(for: urlString)
        _ = data
        return diskPath
    }

    /// Pre-cache a URL (fire-and-forget).
    public func prefetch(_ urlString: String) {
        Task {
            _ = try? await data(for: urlString)
        }
    }

    /// Prefetch conditioned on user document preferences (auto-download setting).
    public func conditionalPrefetch(_ urlString: String, fileSizeMB: Int = 0) {
        Task { @MainActor in
            guard UserPreferencesManager.shared.shouldAutoDownload(fileSizeMB: fileSizeMB) else { return }
            await self.prefetch(urlString)
        }
    }

    /// Return cached data without downloading. Returns nil if not in cache.
    public func cachedData(for urlString: String) -> Data? {
        let key = cacheKey(for: urlString)
        if let cached = memoryCache.object(forKey: key as NSString) {
            return cached as Data
        }
        let diskPath = diskFilePath(for: key)
        guard fileManager.fileExists(atPath: diskPath.path),
              let data = try? Data(contentsOf: diskPath) else { return nil }
        memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
        return data
    }

    /// Check if a URL is already cached (memory or disk).
    public func isCached(_ urlString: String) -> Bool {
        let key = cacheKey(for: urlString)
        if memoryCache.object(forKey: key as NSString) != nil { return true }
        return fileManager.fileExists(atPath: diskFilePath(for: key).path)
    }

    /// Store data directly into the cache (useful for locally generated content).
    public func store(_ data: Data, for urlString: String) {
        let key = cacheKey(for: urlString)
        memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
        try? data.write(to: diskFilePath(for: key), options: .atomic)
    }

    /// Remove a specific entry from both caches.
    public func remove(for urlString: String) {
        let key = cacheKey(for: urlString)
        memoryCache.removeObject(forKey: key as NSString)
        try? fileManager.removeItem(at: diskFilePath(for: key))
    }

    /// Clear all caches.
    public func clearAll() {
        memoryCache.removeAllObjects()
        try? fileManager.removeItem(at: diskCacheURL)
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)
    }

    /// Evict old and over-budget files from disk cache. Call periodically (e.g., app background).
    public func evictExpired() {
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

    // MARK: - Helpers

    private func cacheKey(for urlString: String) -> String {
        let hash = urlString.utf8.reduce(into: UInt64(5381)) { result, byte in
            result = result &* 33 &+ UInt64(byte)
        }
        let ext = URL(string: urlString)?.pathExtension ?? ""
        return ext.isEmpty ? "\(hash)" : "\(hash).\(ext)"
    }

    private func diskFilePath(for key: String) -> URL {
        diskCacheURL.appendingPathComponent(key)
    }
}
