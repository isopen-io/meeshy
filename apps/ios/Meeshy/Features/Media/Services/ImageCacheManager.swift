//
//  ImageCacheManager.swift
//  Meeshy
//
//  High-performance image cache with configurable TTL
//  Supports memory + disk caching with automatic cleanup
//
//  Configuration:
//  - Modify ImageCacheConfiguration.shared values to adjust cache behavior
//  - Use ImageCacheType enum to specify TTL for different image types
//

import UIKit
import CryptoKit

// MARK: - Image Cache Configuration

/// Centralized configuration for image caching in the app
/// Modify these values to adjust image cache behavior globally
struct ImageCacheConfiguration: @unchecked Sendable {

    // MARK: - Singleton

    nonisolated(unsafe) static var shared = ImageCacheConfiguration()

    // MARK: - Image Cache Settings

    /// TTL for images in the disk cache (default: 30 days)
    var imageCacheTTLDays: Int = 30

    /// Maximum memory cache size in MB
    var imageMemoryCacheSizeMB: Int = 50

    /// Maximum disk cache size in MB
    var imageDiskCacheSizeMB: Int = 500

    /// Maximum number of images in memory cache
    var imageMemoryCacheCountLimit: Int = 150

    /// JPEG compression quality for cached images (0.0 - 1.0)
    var imageCompressionQuality: CGFloat = 0.85

    // MARK: - Avatar Cache Settings

    /// TTL for avatars (default: 7 days - avatars change more frequently)
    var avatarCacheTTLDays: Int = 7

    // MARK: - Attachment Cache Settings

    /// TTL for message attachments (default: 30 days)
    var attachmentCacheTTLDays: Int = 30

    /// Maximum attachment cache size in MB
    var attachmentDiskCacheSizeMB: Int = 1000

    // MARK: - Thumbnail Cache Settings

    /// TTL for thumbnails (default: 30 days)
    var thumbnailCacheTTLDays: Int = 30

    /// Maximum thumbnail cache size in MB
    var thumbnailDiskCacheSizeMB: Int = 200

    // MARK: - General Settings

    /// Enable disk caching (set to false for debugging)
    var diskCacheEnabled: Bool = true

    /// Enable memory caching
    var memoryCacheEnabled: Bool = true

    /// Log cache operations (for debugging)
    var logCacheOperations: Bool = false

    // MARK: - Computed Properties

    /// Image cache TTL in seconds
    var imageCacheTTLSeconds: TimeInterval {
        TimeInterval(imageCacheTTLDays * 24 * 60 * 60)
    }

    /// Avatar cache TTL in seconds
    var avatarCacheTTLSeconds: TimeInterval {
        TimeInterval(avatarCacheTTLDays * 24 * 60 * 60)
    }

    /// Attachment cache TTL in seconds
    var attachmentCacheTTLSeconds: TimeInterval {
        TimeInterval(attachmentCacheTTLDays * 24 * 60 * 60)
    }

    /// Thumbnail cache TTL in seconds
    var thumbnailCacheTTLSeconds: TimeInterval {
        TimeInterval(thumbnailCacheTTLDays * 24 * 60 * 60)
    }

    // MARK: - Presets

    /// Apply aggressive caching (longer TTL, larger sizes)
    mutating func applyAggressiveCaching() {
        imageCacheTTLDays = 60
        imageDiskCacheSizeMB = 1000
        imageMemoryCacheSizeMB = 100
        attachmentCacheTTLDays = 60
        thumbnailCacheTTLDays = 60
    }

    /// Apply conservative caching (shorter TTL, smaller sizes)
    mutating func applyConservativeCaching() {
        imageCacheTTLDays = 7
        imageDiskCacheSizeMB = 200
        imageMemoryCacheSizeMB = 30
        attachmentCacheTTLDays = 7
        thumbnailCacheTTLDays = 7
    }

    /// Apply minimal caching (for low storage devices)
    mutating func applyMinimalCaching() {
        imageCacheTTLDays = 3
        imageDiskCacheSizeMB = 100
        imageMemoryCacheSizeMB = 20
        imageMemoryCacheCountLimit = 50
        attachmentCacheTTLDays = 3
        attachmentDiskCacheSizeMB = 200
        thumbnailCacheTTLDays = 3
        thumbnailDiskCacheSizeMB = 50
    }

    /// Reset to default values
    mutating func resetToDefaults() {
        self = ImageCacheConfiguration()
    }
}

// MARK: - Cache Type

/// Types of cached content with their respective TTLs
enum ImageCacheType {
    case image
    case avatar
    case attachment
    case thumbnail

    var ttlDays: Int {
        let config = ImageCacheConfiguration.shared
        switch self {
        case .image:
            return config.imageCacheTTLDays
        case .avatar:
            return config.avatarCacheTTLDays
        case .attachment:
            return config.attachmentCacheTTLDays
        case .thumbnail:
            return config.thumbnailCacheTTLDays
        }
    }

    var ttlSeconds: TimeInterval {
        TimeInterval(ttlDays * 24 * 60 * 60)
    }

    var maxSizeMB: Int {
        let config = ImageCacheConfiguration.shared
        switch self {
        case .image:
            return config.imageDiskCacheSizeMB
        case .avatar:
            return config.imageDiskCacheSizeMB / 4 // Avatars are smaller
        case .attachment:
            return config.attachmentDiskCacheSizeMB
        case .thumbnail:
            return config.thumbnailDiskCacheSizeMB
        }
    }
}

// MARK: - Image Cache Manager

actor ImageCacheManager {
    static let shared = ImageCacheManager()

    private var memoryWarningObserver: (any NSObjectProtocol)?

    // MARK: - Properties

    private let memoryCache = NSCache<NSString, CachedImageEntry>()
    private let diskCacheURL: URL
    private let metadataURL: URL
    private let fileManager = FileManager.default

    /// Cache metadata for TTL tracking
    private var cacheMetadata: [String: CacheEntryMetadata] = [:]

    // MARK: - Configuration Accessors

    private var config: ImageCacheConfiguration { ImageCacheConfiguration.shared }

    // MARK: - Initialization

    private init() {
        // Setup disk cache directory
        let cacheDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        diskCacheURL = cacheDirectory.appendingPathComponent("ImageCache", isDirectory: true)
        metadataURL = cacheDirectory.appendingPathComponent("ImageCacheMetadata.json")

        // Create directory if needed
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)

        // Configure memory cache (access shared config directly to avoid actor isolation)
        let config = ImageCacheConfiguration.shared
        memoryCache.totalCostLimit = config.imageMemoryCacheSizeMB * 1024 * 1024
        memoryCache.countLimit = config.imageMemoryCacheCountLimit

        // Load metadata from disk
        if fileManager.fileExists(atPath: metadataURL.path),
           let data = try? Data(contentsOf: metadataURL),
           let loaded = try? JSONDecoder().decode([String: CacheEntryMetadata].self, from: data) {
            cacheMetadata = loaded
        }

        // Setup memory warning observer
        Task { @MainActor in
            let observer = NotificationCenter.default.addObserver(
                forName: UIApplication.didReceiveMemoryWarningNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task {
                    await self?.clearMemoryCache()
                }
            }
            await self.setMemoryWarningObserver(observer)
        }

        // Schedule periodic cleanup
        Task {
            await performStartupCleanup()
        }
    }

    private func setMemoryWarningObserver(_ observer: any NSObjectProtocol) {
        self.memoryWarningObserver = observer
    }

    // MARK: - Public API

    /// Cache an image with optional cache type for TTL
    func cacheImage(_ image: UIImage, for key: String, type: ImageCacheType = .image) {
        guard config.memoryCacheEnabled || config.diskCacheEnabled else { return }

        let nsKey = key as NSString

        // Cache in memory
        if config.memoryCacheEnabled {
            let entry = CachedImageEntry(image: image, cacheType: type)
            let imageSizeBytes = estimateImageSize(image)
            memoryCache.setObject(entry, forKey: nsKey, cost: imageSizeBytes)
        }

        // Cache to disk asynchronously
        if config.diskCacheEnabled {
            Task {
                await saveToDisk(image, for: key, type: type)
            }
        }

        logIfEnabled("Cached image: \(key.prefix(50))... (type: \(type))")
    }

    /// Get an image from cache, respecting TTL
    func getImage(for key: String, type: ImageCacheType = .image) -> UIImage? {
        let nsKey = key as NSString

        // Check memory cache first
        if config.memoryCacheEnabled,
           let entry = memoryCache.object(forKey: nsKey) {
            // Check if not expired
            if !entry.isExpired {
                logIfEnabled("Memory cache hit: \(key.prefix(50))...")
                return entry.image
            } else {
                // Remove expired entry
                memoryCache.removeObject(forKey: nsKey)
                logIfEnabled("Memory cache expired: \(key.prefix(50))...")
            }
        }

        // Check disk cache
        if config.diskCacheEnabled,
           let image = loadFromDisk(for: key, type: type) {
            // Restore to memory cache
            if config.memoryCacheEnabled {
                let entry = CachedImageEntry(image: image, cacheType: type)
                let imageSizeBytes = estimateImageSize(image)
                memoryCache.setObject(entry, forKey: nsKey, cost: imageSizeBytes)
            }
            logIfEnabled("Disk cache hit: \(key.prefix(50))...")
            return image
        }

        logIfEnabled("Cache miss: \(key.prefix(50))...")
        return nil
    }

    /// Check if an image exists in cache (without loading it)
    func hasImage(for key: String, type: ImageCacheType = .image) -> Bool {
        let nsKey = key as NSString

        // Check memory
        if let entry = memoryCache.object(forKey: nsKey), !entry.isExpired {
            return true
        }

        // Check disk
        let fileURL = diskCacheURL.appendingPathComponent(key.secureMD5Hash)
        guard fileManager.fileExists(atPath: fileURL.path) else { return false }

        // Check TTL
        if let metadata = cacheMetadata[key.secureMD5Hash] {
            return !metadata.isExpired(ttl: type.ttlSeconds)
        }

        return true // Assume valid if no metadata
    }

    /// Remove a specific image from cache
    func removeImage(for key: String) {
        let nsKey = key as NSString

        // Remove from memory
        memoryCache.removeObject(forKey: nsKey)

        // Remove from disk
        let hash = key.secureMD5Hash
        let fileURL = diskCacheURL.appendingPathComponent(hash)
        try? fileManager.removeItem(at: fileURL)

        // Remove metadata
        cacheMetadata.removeValue(forKey: hash)
        saveMetadata()

        logIfEnabled("Removed image: \(key.prefix(50))...")
    }

    /// Clear memory cache only
    func clearMemoryCache() {
        memoryCache.removeAllObjects()
        logIfEnabled("Memory cache cleared")
    }

    /// Clear disk cache only
    func clearDiskCache() {
        try? fileManager.removeItem(at: diskCacheURL)
        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)
        cacheMetadata.removeAll()
        saveMetadata()
        logIfEnabled("Disk cache cleared")
    }

    /// Clear all caches
    func clearAllCaches() {
        clearMemoryCache()
        clearDiskCache()
    }

    // MARK: - Cache Statistics

    /// Get total disk cache size
    func getCacheSize() async -> Int64 {
        var totalSize: Int64 = 0

        guard let enumerator = fileManager.enumerator(
            at: diskCacheURL,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return 0
        }

        for case let fileURL as URL in enumerator.allObjects {
            if let fileSize = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                totalSize += Int64(fileSize)
            }
        }

        return totalSize
    }

    /// Get formatted cache size string
    func getCacheSizeFormatted() async -> String {
        let size = await getCacheSize()
        return ByteCountFormatter.string(fromByteCount: size, countStyle: .file)
    }

    /// Get number of cached images
    func getImageCount() async -> Int {
        guard let enumerator = fileManager.enumerator(at: diskCacheURL, includingPropertiesForKeys: nil) else {
            return 0
        }
        return enumerator.allObjects.count
    }

    /// Get cache statistics
    func getCacheStats() async -> CacheStats {
        let size = await getCacheSize()
        let count = await getImageCount()
        let oldestEntry = cacheMetadata.values.min(by: { $0.createdAt < $1.createdAt })
        let newestEntry = cacheMetadata.values.max(by: { $0.createdAt < $1.createdAt })

        return CacheStats(
            diskSizeBytes: size,
            imageCount: count,
            oldestEntryDate: oldestEntry?.createdAt,
            newestEntryDate: newestEntry?.createdAt,
            memoryCountLimit: config.imageMemoryCacheCountLimit,
            diskSizeLimitMB: config.imageDiskCacheSizeMB,
            ttlDays: config.imageCacheTTLDays
        )
    }

    // MARK: - Cache Maintenance

    /// Clean up expired entries based on TTL
    func cleanupExpiredCache() async {
        logIfEnabled("Starting expired cache cleanup...")

        var removedCount = 0
        let defaultTTL = config.imageCacheTTLSeconds

        // Check each entry in metadata
        for (hash, metadata) in cacheMetadata {
            let ttl = metadata.cacheType?.ttlSeconds ?? defaultTTL
            if metadata.isExpired(ttl: ttl) {
                let fileURL = diskCacheURL.appendingPathComponent(hash)
                try? fileManager.removeItem(at: fileURL)
                cacheMetadata.removeValue(forKey: hash)
                removedCount += 1
            }
        }

        // Also check files without metadata (legacy)
        if let enumerator = fileManager.enumerator(
            at: diskCacheURL,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) {
            let cutoffDate = Date().addingTimeInterval(-defaultTTL)

            for case let fileURL as URL in enumerator.allObjects {
                let hash = fileURL.lastPathComponent
                guard cacheMetadata[hash] == nil else { continue }

                if let modDate = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
                   modDate < cutoffDate {
                    try? fileManager.removeItem(at: fileURL)
                    removedCount += 1
                }
            }
        }

        saveMetadata()
        logIfEnabled("Cleanup complete: removed \(removedCount) expired entries")
    }

    /// Trim cache to configured size limit
    func trimCacheToSizeLimit() async {
        let maxBytes = Int64(config.imageDiskCacheSizeMB * 1024 * 1024)
        var currentSize = await getCacheSize()

        guard currentSize > maxBytes else { return }

        logIfEnabled("Trimming cache: \(currentSize) bytes > \(maxBytes) bytes limit")

        // Get all files sorted by last access date (oldest first)
        guard let enumerator = fileManager.enumerator(
            at: diskCacheURL,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        var files: [(URL, Date, Int64)] = []
        for case let fileURL as URL in enumerator.allObjects {
            let hash = fileURL.lastPathComponent
            let accessDate = cacheMetadata[hash]?.lastAccessedAt
                ?? (try? fileURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? Date.distantPast

            if let fileSize = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) {
                files.append((fileURL, accessDate, Int64(fileSize)))
            }
        }

        // Sort by access date (oldest first)
        files.sort { $0.1 < $1.1 }

        // Remove oldest files until under limit
        var removedCount = 0
        for (fileURL, _, fileSize) in files {
            guard currentSize > maxBytes else { break }

            let hash = fileURL.lastPathComponent
            try? fileManager.removeItem(at: fileURL)
            cacheMetadata.removeValue(forKey: hash)
            currentSize -= fileSize
            removedCount += 1
        }

        saveMetadata()
        logIfEnabled("Trim complete: removed \(removedCount) files")
    }

    // MARK: - Private Methods

    private func performStartupCleanup() async {
        // Clean expired entries on startup
        await cleanupExpiredCache()

        // Trim to size limit
        await trimCacheToSizeLimit()
    }

    private func saveToDisk(_ image: UIImage, for key: String, type: ImageCacheType) async {
        let hash = key.secureMD5Hash
        let fileURL = diskCacheURL.appendingPathComponent(hash)

        // Compress image before saving
        guard let data = image.jpegData(compressionQuality: config.imageCompressionQuality) else { return }

        do {
            try data.write(to: fileURL, options: .atomic)

            // Update metadata
            cacheMetadata[hash] = CacheEntryMetadata(
                key: key,
                cacheType: type,
                fileSize: Int64(data.count)
            )
            saveMetadata()

            // Trim cache if needed
            await trimCacheToSizeLimit()
        } catch {
            logIfEnabled("Failed to save to disk: \(error)")
        }
    }

    private func loadFromDisk(for key: String, type: ImageCacheType) -> UIImage? {
        let hash = key.secureMD5Hash
        let fileURL = diskCacheURL.appendingPathComponent(hash)

        // Check TTL first
        if let metadata = cacheMetadata[hash] {
            let ttl = metadata.cacheType?.ttlSeconds ?? type.ttlSeconds
            if metadata.isExpired(ttl: ttl) {
                // Remove expired file
                try? fileManager.removeItem(at: fileURL)
                cacheMetadata.removeValue(forKey: hash)
                saveMetadata()
                return nil
            }

            // Update last accessed time
            cacheMetadata[hash]?.lastAccessedAt = Date()
            saveMetadata()
        }

        guard let data = try? Data(contentsOf: fileURL),
              let image = UIImage(data: data) else {
            return nil
        }

        return image
    }

    private func estimateImageSize(_ image: UIImage) -> Int {
        let width = Int(image.size.width * image.scale)
        let height = Int(image.size.height * image.scale)
        return width * height * 4 // 4 bytes per pixel (RGBA)
    }

    // MARK: - Metadata Persistence

    private func loadMetadata() {
        guard fileManager.fileExists(atPath: metadataURL.path),
              let data = try? Data(contentsOf: metadataURL),
              let loaded = try? JSONDecoder().decode([String: CacheEntryMetadata].self, from: data) else {
            return
        }
        cacheMetadata = loaded
    }

    private func saveMetadata() {
        guard let data = try? JSONEncoder().encode(cacheMetadata) else { return }
        try? data.write(to: metadataURL, options: .atomic)
    }

    // MARK: - Logging

    private func logIfEnabled(_ message: String) {
        guard config.logCacheOperations else { return }
        print("[ImageCache] \(message)")
    }
}

// MARK: - Cache Entry Metadata

private struct CacheEntryMetadata: Codable {
    let key: String
    let cacheType: ImageCacheType?
    let fileSize: Int64
    let createdAt: Date
    var lastAccessedAt: Date

    init(key: String, cacheType: ImageCacheType, fileSize: Int64) {
        self.key = key
        self.cacheType = cacheType
        self.fileSize = fileSize
        self.createdAt = Date()
        self.lastAccessedAt = Date()
    }

    func isExpired(ttl: TimeInterval) -> Bool {
        Date().timeIntervalSince(createdAt) > ttl
    }
}

// MARK: - Cached Image Entry (Memory)

private final class CachedImageEntry: NSObject {
    let image: UIImage
    let cacheType: ImageCacheType
    let createdAt: Date

    init(image: UIImage, cacheType: ImageCacheType) {
        self.image = image
        self.cacheType = cacheType
        self.createdAt = Date()
    }

    var isExpired: Bool {
        Date().timeIntervalSince(createdAt) > cacheType.ttlSeconds
    }
}

// MARK: - Cache Statistics

struct CacheStats {
    let diskSizeBytes: Int64
    let imageCount: Int
    let oldestEntryDate: Date?
    let newestEntryDate: Date?
    let memoryCountLimit: Int
    let diskSizeLimitMB: Int
    let ttlDays: Int

    var diskSizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: diskSizeBytes, countStyle: .file)
    }

    var diskUsagePercent: Double {
        let limitBytes = Double(diskSizeLimitMB * 1024 * 1024)
        return min(100, (Double(diskSizeBytes) / limitBytes) * 100)
    }
}

// MARK: - ImageCacheType Codable Extension

extension ImageCacheType: Codable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)
        switch rawValue {
        case "image": self = .image
        case "avatar": self = .avatar
        case "attachment": self = .attachment
        case "thumbnail": self = .thumbnail
        default: self = .image
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .image: try container.encode("image")
        case .avatar: try container.encode("avatar")
        case .attachment: try container.encode("attachment")
        case .thumbnail: try container.encode("thumbnail")
        }
    }
}

// MARK: - Secure MD5 Hash

extension String {
    /// Secure MD5 hash using CryptoKit
    var secureMD5Hash: String {
        let data = Data(self.utf8)
        let hash = Insecure.MD5.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - UIImageView Extension

extension UIImageView {
    private static var imageURLKey: UInt8 = 0

    private var imageURL: String? {
        get {
            objc_getAssociatedObject(self, &Self.imageURLKey) as? String
        }
        set {
            objc_setAssociatedObject(self, &Self.imageURLKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }

    func loadCachedImage(from urlString: String, type: ImageCacheType = .image, placeholder: UIImage? = nil) {
        imageURL = urlString

        Task {
            // Check cache first
            if let cachedImage = await ImageCacheManager.shared.getImage(for: urlString, type: type) {
                await MainActor.run {
                    if imageURL == urlString {
                        self.image = cachedImage
                    }
                }
                return
            }

            // Set placeholder
            await MainActor.run {
                if imageURL == urlString {
                    self.image = placeholder
                }
            }

            // Download image
            guard let url = URL(string: urlString),
                  let (data, _) = try? await URLSession.shared.data(from: url),
                  let image = UIImage(data: data) else {
                return
            }

            // Cache the image
            await ImageCacheManager.shared.cacheImage(image, for: urlString, type: type)

            // Update UI
            await MainActor.run {
                if imageURL == urlString {
                    UIView.transition(
                        with: self,
                        duration: 0.2,
                        options: .transitionCrossDissolve,
                        animations: { self.image = image }
                    )
                }
            }
        }
    }
}
