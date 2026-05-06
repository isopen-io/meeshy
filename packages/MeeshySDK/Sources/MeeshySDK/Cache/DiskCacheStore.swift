import Foundation
import CryptoKit
import UIKit
import os

public actor DiskCacheStore: ReadableCacheStore {
    public typealias Key = String
    public typealias Value = Data

    public let policy: CachePolicy

    nonisolated(unsafe) private let memoryCache: NSCache<NSString, CacheBox<Data>>
    private let baseDirectory: URL
    private let fileManager = FileManager.default
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "disk-cache")
    private var inFlightTasks: [String: Task<Data, Error>] = [:]
    private var fileTimestamps: [String: Date] = [:]

    public init(policy: CachePolicy, baseDirectory: URL? = nil) {
        self.policy = policy
        let subdir: String
        if case .disk(let sub, _) = policy.storageLocation {
            subdir = sub
        } else {
            subdir = "Default"
        }
        if let base = baseDirectory {
            self.baseDirectory = base
        } else {
            let searchPath: FileManager.SearchPathDirectory = subdir == "Thumbnails" ? .cachesDirectory : .applicationSupportDirectory
            let root = FileManager.default.urls(for: searchPath, in: .userDomainMask).first!
            self.baseDirectory = root.appendingPathComponent("MeeshyMedia/\(subdir)", isDirectory: true)
        }
        let cache = NSCache<NSString, CacheBox<Data>>()
        cache.countLimit = 100
        cache.totalCostLimit = 80 * 1024 * 1024
        self.memoryCache = cache
        try? FileManager.default.createDirectory(at: self.baseDirectory, withIntermediateDirectories: true)

        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                DiskCacheStore.clearImageCache()
            }
            // Cannot easily clear memoryCache as it's not isolated(unsafe) for closure capture
            // but the static _imageCache is the main memory consumer.
        }
    }

    // MARK: - ReadableCacheStore

    public func load(for key: String) async -> CacheResult<[Data]> {
        let fileKey = Self.fileKey(for: key)
        if let cached = memoryCache.object(forKey: fileKey as NSString) {
            let age = Date().timeIntervalSince(fileTimestamps[fileKey] ?? Date())
            let freshness = policy.freshness(age: age)
            switch freshness {
            case .fresh: return .fresh([cached.value], age: age)
            case .stale: return .stale([cached.value], age: age)
            case .expired:
                memoryCache.removeObject(forKey: fileKey as NSString)
                return .expired
            }
        }
        let filePath = diskFilePath(for: fileKey)
        guard fileManager.fileExists(atPath: filePath.path),
              let data = try? Data(contentsOf: filePath) else {
            return .empty
        }
        let modDate = (try? fileManager.attributesOfItem(atPath: filePath.path)[.modificationDate] as? Date) ?? Date()
        let age = Date().timeIntervalSince(modDate)
        let freshness = policy.freshness(age: age)
        switch freshness {
        case .fresh:
            memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
            fileTimestamps[fileKey] = modDate
            return .fresh([data], age: age)
        case .stale:
            memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
            fileTimestamps[fileKey] = modDate
            return .stale([data], age: age)
        case .expired:
            return .expired
        }
    }

    public func invalidate(for key: String) async {
        let fileKey = Self.fileKey(for: key)
        memoryCache.removeObject(forKey: fileKey as NSString)
        fileTimestamps.removeValue(forKey: fileKey)
        let filePath = diskFilePath(for: fileKey)
        try? fileManager.removeItem(at: filePath)
    }

    public func invalidateAll() async {
        memoryCache.removeAllObjects()
        fileTimestamps.removeAll()
        try? fileManager.removeItem(at: baseDirectory)
        try? fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Write

    public func save(_ data: Data, for key: String) async {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)
        do {
            try data.write(to: filePath, options: .atomic)
            try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: filePath.path)
        } catch {
            logger.error("Failed to write file for key \(fileKey): \(error.localizedDescription)")
            return
        }
        memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
        fileTimestamps[fileKey] = Date()
    }

    // MARK: - Queries

    public func localFileURL(for key: String) -> URL? {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)
        return fileManager.fileExists(atPath: filePath.path) ? filePath : nil
    }

    nonisolated public func cachedData(for key: String) -> Data? {
        let fileKey = Self.fileKey(for: key)
        return memoryCache.object(forKey: fileKey as NSString)?.value
    }

    /// Synchronous local file URL check — no actor hop needed.
    /// Returns the file URL if it exists on disk, nil otherwise.
    nonisolated public func cachedFileURL(for key: String) -> URL? {
        let fileKey = Self.fileKey(for: key)
        let filePath = baseDirectory.appendingPathComponent(fileKey)
        return FileManager.default.fileExists(atPath: filePath.path) ? filePath : nil
    }

    public func isCached(_ key: String) -> Bool {
        let fileKey = Self.fileKey(for: key)
        if memoryCache.object(forKey: fileKey as NSString) != nil { return true }
        return fileManager.fileExists(atPath: diskFilePath(for: fileKey).path)
    }

    // MARK: - MediaCaching-Compatible API

    public func data(for urlString: String) async throws -> Data {
        // 1. Check cache (memory + disk)
        let result = await load(for: urlString)
        if let data = result.value?.first { return data }

        // 2. Deduplicate in-flight downloads for same URL
        let fileKey = Self.fileKey(for: urlString)
        if let existing = inFlightTasks[fileKey] {
            return try await existing.value
        }

        // 3. Download from network and cache
        guard let url = URL(string: urlString),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            throw DiskCacheError.notCached(urlString)
        }

        let task = Task<Data, Error> {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                throw DiskCacheError.notCached(urlString)
            }
            await save(data, for: urlString)
            return data
        }

        inFlightTasks[fileKey] = task
        defer { inFlightTasks[fileKey] = nil }
        return try await task.value
    }

    public func localFileURLOrThrow(for urlString: String) async throws -> URL {
        guard let url = localFileURL(for: urlString) else {
            throw DiskCacheError.notCached(urlString)
        }
        return url
    }

    public func store(_ data: Data, for key: String) async {
        await save(data, for: key)
    }

    public func remove(for key: String) async {
        await invalidate(for: key)
    }

    public func clearAll() async {
        await invalidateAll()
    }

    public enum DiskCacheError: Error, LocalizedError {
        case notCached(String)

        public var errorDescription: String? {
            switch self {
            case .notCached(let key): return "No cached data for key: \(key)"
            }
        }
    }

    // MARK: - Eviction

    public func evictExpired() async {
        guard let enumerator = fileManager.enumerator(at: baseDirectory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return }
        let now = Date()
        var evictedCount = 0
        while let fileURL = enumerator.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey]),
                  let modDate = values.contentModificationDate else { continue }
            let age = now.timeIntervalSince(modDate)
            if policy.freshness(age: age) == .expired {
                let fileName = fileURL.lastPathComponent
                memoryCache.removeObject(forKey: fileName as NSString)
                fileTimestamps.removeValue(forKey: fileName)
                try? fileManager.removeItem(at: fileURL)
                evictedCount += 1
            }
        }
        if evictedCount > 0 { logger.debug("Evicted \(evictedCount) expired files") }
    }

    public func evictOverBudget() async {
        let maxBytes: Int
        if case .disk(_, let max) = policy.storageLocation {
            maxBytes = max
        } else { return }
        guard let enumerator = fileManager.enumerator(at: baseDirectory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return }
        var totalSize = 0
        var files: [(url: URL, date: Date, size: Int)] = []
        while let fileURL = enumerator.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let modDate = values.contentModificationDate,
                  let size = values.fileSize else { continue }
            files.append((fileURL, modDate, size))
            totalSize += size
        }
        guard totalSize > maxBytes else { return }
        let sorted = files.sorted { $0.date < $1.date }
        for file in sorted {
            guard totalSize > maxBytes else { break }
            let fileName = file.url.lastPathComponent
            memoryCache.removeObject(forKey: fileName as NSString)
            fileTimestamps.removeValue(forKey: fileName)
            try? fileManager.removeItem(at: file.url)
            totalSize -= file.size
        }
        logger.debug("Budget eviction: trimmed to \(totalSize) bytes (max \(maxBytes))")
    }

    // MARK: - UIImage Cache

    nonisolated(unsafe) private static let _imageCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 150
        cache.totalCostLimit = 80 * 1024 * 1024
        return cache
    }()

    @MainActor
    public static func clearImageCache() {
        _imageCache.removeAllObjects()
    }

    nonisolated public static func cachedImage(for urlString: String) -> UIImage? {
        let key = fileKey(for: urlString) as NSString
        return _imageCache.object(forKey: key)
    }

    /// Hard cap for the decoded bitmap we will keep resident in the NSCache
    /// (in bytes). A malicious or accidentally-huge image (e.g. 20K×20K JPEG
    /// that decodes to >1 GB of pixel data) would otherwise blow the NSCache
    /// budget and trigger a memory warning, evicting everything else. We
    /// decode to check dimensions, then refuse to cache anything above the
    /// threshold — the `UIImage` still returns so the caller can display it
    /// once, but we won't hold onto it.
    private static let maxCacheableDecodedBytes: Int = 50 * 1024 * 1024 // 50 MB

    private static func downsampledImage(data: Data, maxPixelSize: CGFloat = 1200) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceShouldCache: false,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        else { return UIImage(data: data) }
        return UIImage(cgImage: cgImage)
    }

    public func image(for urlString: String) async -> UIImage? {
        await image(for: urlString, maxPixelSize: 1200)
    }

    public func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage? {
        let fileKey = Self.fileKey(for: urlString)

        if let cached = Self._imageCache.object(forKey: fileKey as NSString) {
            return cached
        }

        let result = await load(for: urlString)
        if let data = result.value?.first, let image = Self.downsampledImage(data: data, maxPixelSize: maxPixelSize) {
            Self.cacheIfWithinBudget(image, key: fileKey)
            return image
        }

        guard let url = URL(string: urlString) else { return nil }

        // Local file:// URLs — load directly from filesystem
        if url.scheme == "file" {
            if let data = try? Data(contentsOf: url), let image = Self.downsampledImage(data: data, maxPixelSize: maxPixelSize) {
                Self.cacheIfWithinBudget(image, key: fileKey)
                return image
            }
            return nil
        }

        guard url.scheme == "https" || url.scheme == "http" else { return nil }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode),
                  let image = Self.downsampledImage(data: data, maxPixelSize: maxPixelSize) else { return nil }
            await save(data, for: urlString)
            Self.cacheIfWithinBudget(image, key: fileKey)
            return image
        } catch {
            return nil
        }
    }

    /// Centralised NSCache insertion with a size guard so a single oversized
    /// image never evicts the rest of the in-memory cache. We compute the
    /// decoded cost once and skip caching when it blows past
    /// `maxCacheableDecodedBytes` — the caller still gets the `UIImage`, it
    /// just won't be kept around for the next scroll.
    private nonisolated static func cacheIfWithinBudget(_ image: UIImage, key: String) {
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
        guard cost > 0, cost <= maxCacheableDecodedBytes else { return }
        Task { @MainActor in
            Self._imageCache.setObject(image, forKey: key as NSString, cost: cost)
        }
    }

    /// Configure the in-memory UIImage cache limits at app startup.
    /// Call once from `ImageDownsamplingConfig.applyGlobal()` before any image
    /// is loaded. Thread-safe: `NSCache` property writes are atomic.
    ///
    /// - Parameter memoryCostLimitBytes: Maximum total decoded-pixel cost kept
    ///   resident. Default at init-time is 80 MB; recommended app-level value
    ///   is 60 MB to leave headroom for UIKit/Metal allocations.
    public nonisolated static func configureImageCache(memoryCostLimitBytes: Int) {
        _imageCache.totalCostLimit = memoryCostLimitBytes
    }

    /// Pre-cache an image in the static UIImage NSCache for immediate display
    /// in ProgressiveCachedImage. Used for optimistic media messages where the
    /// local file URL is set as the attachment URL before upload.
    public nonisolated static func cacheImageForPreview(_ image: UIImage, key: String) {
        let cacheKey = Self.fileKey(for: key)
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
        Task { @MainActor in
            Self._imageCache.setObject(image, forKey: cacheKey as NSString, cost: cost)
        }
    }

    // MARK: - File Key

    nonisolated static func fileKey(for urlString: String) -> String {
        let digest = SHA256.hash(data: Data(urlString.utf8))
        let hex = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
        let ext = URL(string: urlString)?.pathExtension ?? ""
        return ext.isEmpty ? hex : "\(hex).\(ext)"
    }

    private func diskFilePath(for fileKey: String) -> URL {
        baseDirectory.appendingPathComponent(fileKey)
    }
}
