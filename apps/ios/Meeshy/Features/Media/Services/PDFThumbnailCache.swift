//
//  PDFThumbnailCache.swift
//  Meeshy
//
//  Persistent cache for PDF thumbnail images
//  Avoids regenerating thumbnails on every message display
//
//  iOS 16+
//

import Foundation
import UIKit
import PDFKit

// MARK: - PDF Thumbnail Result

/// Result of PDF thumbnail generation with metadata
struct PDFThumbnailResult: Sendable {
    let thumbnail: UIImage
    let pageCount: Int
    let pageSize: CGSize
}

// MARK: - PDF Thumbnail Cache

/// Thread-safe cache for PDF thumbnail images
actor PDFThumbnailCache {

    // MARK: - Singleton

    static let shared = PDFThumbnailCache()

    // MARK: - Properties

    private let cacheDirectory: URL
    private var memoryCache: [String: PDFThumbnailResult] = [:]
    private let maxMemoryCacheSize = 50
    private let fileManager = FileManager.default

    // MARK: - Initialization

    private init() {
        // Create cache directory in Caches (can be cleared by system if needed)
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("PDFThumbnails", isDirectory: true)

        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Public API

    /// Generate PDF thumbnail from URL
    /// - Parameters:
    ///   - url: Local file URL of the PDF
    ///   - size: Desired thumbnail size
    /// - Returns: Thumbnail result with image and metadata, or nil if generation failed
    func getThumbnail(for url: URL, size: CGSize) async -> PDFThumbnailResult? {
        let cacheKey = cacheKey(for: url, size: size)

        // 1. Check memory cache first (fastest)
        if let cached = memoryCache[cacheKey] {
            return cached
        }

        // 2. Check disk cache
        if let cached = loadFromDisk(key: cacheKey, url: url) {
            // Store in memory cache for faster access
            storeInMemoryCache(key: cacheKey, result: cached)
            return cached
        }

        // 3. Generate new thumbnail
        guard let result = generateThumbnail(from: url, size: size) else {
            return nil
        }

        // 4. Cache it
        storeInMemoryCache(key: cacheKey, result: result)
        saveToDisk(key: cacheKey, result: result)

        return result
    }

    /// Generate PDF thumbnail from remote URL (downloads first if needed)
    /// - Parameters:
    ///   - remoteURL: Remote URL string of the PDF
    ///   - size: Desired thumbnail size
    /// - Returns: Thumbnail result with image and metadata, or nil if generation failed
    func getThumbnail(forRemoteURL remoteURL: String, size: CGSize) async -> PDFThumbnailResult? {
        // Check if already cached locally
        if let localURL = await AttachmentFileCache.shared.getFile(for: remoteURL, type: .document) {
            return await getThumbnail(for: localURL, size: size)
        }

        // Download and cache the PDF
        guard let localURL = await AttachmentFileCache.shared.downloadAndCache(from: remoteURL, type: .document) else {
            return nil
        }

        return await getThumbnail(for: localURL, size: size)
    }

    /// Pre-generate and cache thumbnail in background
    /// Call this when loading messages to avoid delay on display
    func preloadThumbnail(for url: URL, size: CGSize) {
        Task.detached(priority: .background) {
            _ = await self.getThumbnail(for: url, size: size)
        }
    }

    /// Clear all cached thumbnails
    func clearCache() {
        memoryCache.removeAll()
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Get cache size in bytes
    func cacheSize() -> Int64 {
        var size: Int64 = 0

        if let enumerator = fileManager.enumerator(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let fileURL as URL in enumerator {
                if let fileSize = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    size += Int64(fileSize)
                }
            }
        }

        return size
    }

    // MARK: - Cache Key Generation

    private func cacheKey(for url: URL, size: CGSize) -> String {
        // Use URL path hash + size for unique key
        let urlString = url.lastPathComponent + url.path
        let sizeString = "\(Int(size.width))x\(Int(size.height))"
        let combined = "\(urlString)_\(sizeString)"

        // Create a short hash
        let hash = combined.data(using: .utf8)?.base64EncodedString() ?? combined
        let shortHash = String(hash.prefix(40)).replacingOccurrences(of: "/", with: "_")
        return shortHash
    }

    // MARK: - Memory Cache

    private func storeInMemoryCache(key: String, result: PDFThumbnailResult) {
        // Evict oldest entries if cache is full
        if memoryCache.count >= maxMemoryCacheSize {
            // Remove first 20% of entries
            let keysToRemove = Array(memoryCache.keys.prefix(maxMemoryCacheSize / 5))
            for k in keysToRemove {
                memoryCache.removeValue(forKey: k)
            }
        }

        memoryCache[key] = result
    }

    // MARK: - Disk Cache

    private func fileURL(for key: String) -> URL {
        cacheDirectory.appendingPathComponent("\(key).thumb")
    }

    private func metadataURL(for key: String) -> URL {
        cacheDirectory.appendingPathComponent("\(key).meta")
    }

    private func loadFromDisk(key: String, url: URL) -> PDFThumbnailResult? {
        let thumbURL = fileURL(for: key)
        let metaURL = metadataURL(for: key)

        guard fileManager.fileExists(atPath: thumbURL.path),
              fileManager.fileExists(atPath: metaURL.path),
              let imageData = try? Data(contentsOf: thumbURL),
              let image = UIImage(data: imageData),
              let metaData = try? Data(contentsOf: metaURL),
              let metadata = try? JSONDecoder().decode(PDFThumbnailMetadata.self, from: metaData) else {
            return nil
        }

        return PDFThumbnailResult(
            thumbnail: image,
            pageCount: metadata.pageCount,
            pageSize: CGSize(width: metadata.pageWidth, height: metadata.pageHeight)
        )
    }

    private func saveToDisk(key: String, result: PDFThumbnailResult) {
        let thumbURL = fileURL(for: key)
        let metaURL = metadataURL(for: key)

        // Save thumbnail as JPEG (good quality, smaller size)
        guard let imageData = result.thumbnail.jpegData(compressionQuality: 0.8) else {
            return
        }

        let metadata = PDFThumbnailMetadata(
            pageCount: result.pageCount,
            pageWidth: result.pageSize.width,
            pageHeight: result.pageSize.height
        )

        guard let metaData = try? JSONEncoder().encode(metadata) else {
            return
        }

        try? imageData.write(to: thumbURL)
        try? metaData.write(to: metaURL)
    }

    // MARK: - Thumbnail Generation

    private nonisolated func generateThumbnail(from url: URL, size: CGSize) -> PDFThumbnailResult? {
        // Open PDF document
        guard let document = PDFDocument(url: url) else {
            print("[PDFThumbnailCache] Failed to open PDF: \(url.lastPathComponent)")
            return nil
        }

        // Get first page
        guard let page = document.page(at: 0) else {
            print("[PDFThumbnailCache] PDF has no pages: \(url.lastPathComponent)")
            return nil
        }

        // Get page bounds
        let pageRect = page.bounds(for: .mediaBox)

        // Calculate scale to fit desired size while maintaining aspect ratio
        let scale = min(size.width / pageRect.width, size.height / pageRect.height)
        let thumbnailSize = CGSize(
            width: pageRect.width * scale,
            height: pageRect.height * scale
        )

        // Generate thumbnail using PDFKit's built-in method
        // This is optimized and handles rotation correctly
        let thumbnail = page.thumbnail(of: thumbnailSize, for: .mediaBox)

        return PDFThumbnailResult(
            thumbnail: thumbnail,
            pageCount: document.pageCount,
            pageSize: pageRect.size
        )
    }
}

// MARK: - Metadata Structure

private struct PDFThumbnailMetadata: Codable {
    let pageCount: Int
    let pageWidth: CGFloat
    let pageHeight: CGFloat
}

// MARK: - Helper Function

/// Generate a PDF thumbnail from a local file URL
/// - Parameters:
///   - url: Local file URL of the PDF
///   - size: Desired thumbnail size (maintains aspect ratio)
/// - Returns: UIImage of the first page, or nil if generation failed
func generatePDFThumbnail(url: URL, size: CGSize) -> UIImage? {
    guard let document = PDFDocument(url: url),
          let page = document.page(at: 0) else {
        return nil
    }

    let pageRect = page.bounds(for: .mediaBox)
    let scale = min(size.width / pageRect.width, size.height / pageRect.height)
    let thumbnailSize = CGSize(
        width: pageRect.width * scale,
        height: pageRect.height * scale
    )

    return page.thumbnail(of: thumbnailSize, for: .mediaBox)
}

/// Generate a PDF thumbnail asynchronously with caching
/// - Parameters:
///   - url: Local file URL of the PDF
///   - size: Desired thumbnail size (maintains aspect ratio)
/// - Returns: PDFThumbnailResult with thumbnail and metadata, or nil if generation failed
func generatePDFThumbnailAsync(url: URL, size: CGSize) async -> PDFThumbnailResult? {
    return await PDFThumbnailCache.shared.getThumbnail(for: url, size: size)
}
