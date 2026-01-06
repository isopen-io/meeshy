//
//  AttachmentFileCache.swift
//  Meeshy
//
//  Persistent file cache for attachments (images, videos, audio, documents)
//  Files are stored permanently until manually cleared by the user
//  No TTL - attachments are kept indefinitely to avoid re-downloading
//
//  Usage:
//    // Check if file exists
//    if let localURL = await AttachmentFileCache.shared.getFile(for: remoteURL) {
//        // Use local file
//    } else {
//        // Download and cache
//        let localURL = await AttachmentFileCache.shared.downloadAndCache(from: remoteURL, type: .video)
//    }
//

import Foundation
import UIKit
import CryptoKit

// MARK: - Cache File Type

/// Types of attachments with their storage directories for caching
enum CacheFileType: String, CaseIterable {
    case image = "Images"
    case video = "Videos"
    case audio = "Audio"
    case document = "Documents"  // PDF, DOC, XLS, etc.
    case archive = "Archives"    // ZIP, RAR, etc.
    case code = "Code"           // Source code files
    case other = "Other"

    /// File extensions for each type
    var extensions: [String] {
        switch self {
        case .image:
            return ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tiff"]
        case .video:
            return ["mp4", "mov", "avi", "mkv", "webm", "m4v", "3gp"]
        case .audio:
            return ["mp3", "wav", "m4a", "aac", "ogg", "flac", "wma"]
        case .document:
            return ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "odp"]
        case .archive:
            return ["zip", "rar", "7z", "tar", "gz", "bz2"]
        case .code:
            return ["swift", "js", "ts", "py", "java", "kt", "c", "cpp", "h", "json", "xml", "html", "css", "sql"]
        case .other:
            return []
        }
    }

    /// Determine type from file extension
    static func from(extension ext: String) -> CacheFileType {
        let lowercased = ext.lowercased()
        for type in CacheFileType.allCases {
            if type.extensions.contains(lowercased) {
                return type
            }
        }
        return .other
    }

    /// Determine type from URL
    static func from(url: URL) -> CacheFileType {
        return from(extension: url.pathExtension)
    }

    /// Determine type from MIME type
    static func from(mimeType: String) -> CacheFileType {
        let lowercased = mimeType.lowercased()
        if lowercased.hasPrefix("image/") { return .image }
        if lowercased.hasPrefix("video/") { return .video }
        if lowercased.hasPrefix("audio/") { return .audio }
        if lowercased.contains("pdf") || lowercased.contains("document") || lowercased.contains("spreadsheet") || lowercased.contains("presentation") { return .document }
        if lowercased.contains("zip") || lowercased.contains("rar") || lowercased.contains("archive") || lowercased.contains("compressed") { return .archive }
        if lowercased.contains("text/") || lowercased.contains("application/json") || lowercased.contains("application/xml") { return .code }
        return .other
    }
}

// MARK: - Cache Statistics

struct AttachmentCacheStats: Sendable {
    let totalSizeBytes: Int64
    let fileCount: Int
    let imageCount: Int
    let videoCount: Int
    let audioCount: Int
    let documentCount: Int
    let archiveCount: Int
    let codeCount: Int
    let otherCount: Int

    var totalSizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: totalSizeBytes, countStyle: .file)
    }
}

// MARK: - Attachment File Cache

actor AttachmentFileCache {

    // MARK: - Singleton

    static let shared = AttachmentFileCache()

    // MARK: - Properties

    private let fileManager = FileManager.default
    private let baseCacheURL: URL
    private var downloadTasks: [String: Task<URL?, Error>] = [:]

    // MARK: - Initialization

    private init() {
        // Use Documents directory for persistent storage (survives app updates)
        // Caches directory would be cleared by system under storage pressure
        let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        baseCacheURL = documentsDirectory.appendingPathComponent("AttachmentCache", isDirectory: true)

        // Create base directory and subdirectories
        createDirectoryStructure()
    }

    // MARK: - Directory Management

    private nonisolated func createDirectoryStructure() {
        // Create base directory
        try? FileManager.default.createDirectory(at: baseCacheURL, withIntermediateDirectories: true)

        // Create subdirectories for each type
        for type in CacheFileType.allCases {
            let typeDir = baseCacheURL.appendingPathComponent(type.rawValue, isDirectory: true)
            try? FileManager.default.createDirectory(at: typeDir, withIntermediateDirectories: true)
        }
    }

    private func directory(for type: CacheFileType) -> URL {
        baseCacheURL.appendingPathComponent(type.rawValue, isDirectory: true)
    }

    // MARK: - Cache Key Generation

    private func cacheKey(for urlString: String) -> String {
        let data = Data(urlString.utf8)
        let hash = Insecure.MD5.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }

    private func fileURL(for urlString: String, type: CacheFileType, extension ext: String? = nil) -> URL {
        let key = cacheKey(for: urlString)
        let dir = directory(for: type)

        // Preserve original extension if available
        if let ext = ext, !ext.isEmpty {
            return dir.appendingPathComponent("\(key).\(ext)")
        }
        return dir.appendingPathComponent(key)
    }

    // MARK: - Public API

    /// Check if a file is cached and return local URL
    func getFile(for urlString: String, type: CacheFileType? = nil) -> URL? {
        let fileType = type ?? CacheFileType.from(extension: URL(string: urlString)?.pathExtension ?? "")
        let ext = URL(string: urlString)?.pathExtension
        let localURL = fileURL(for: urlString, type: fileType, extension: ext)

        if fileManager.fileExists(atPath: localURL.path) {
            return localURL
        }
        return nil
    }

    /// Check if a file is cached
    func isCached(urlString: String, type: CacheFileType? = nil) -> Bool {
        return getFile(for: urlString, type: type) != nil
    }

    /// Download and cache a file, returns local URL
    func downloadAndCache(from urlString: String, type: CacheFileType? = nil) async -> URL? {
        // Handle relative URLs by prepending base URL
        let absoluteURLString = await resolveToAbsoluteURL(urlString)
        print("[AttachmentFileCache] Downloading from: \(absoluteURLString)")

        guard let url = URL(string: absoluteURLString) else {
            print("[AttachmentFileCache] Invalid URL: \(absoluteURLString)")
            return nil
        }

        let fileType = type ?? CacheFileType.from(url: url)
        let ext = url.pathExtension
        // Use original urlString as cache key for consistency
        let localURL = fileURL(for: urlString, type: fileType, extension: ext)
        print("[AttachmentFileCache] Will save to: \(localURL.path)")

        // Check if already cached
        if fileManager.fileExists(atPath: localURL.path) {
            print("[AttachmentFileCache] Already cached")
            return localURL
        }

        // Check if download already in progress
        let key = cacheKey(for: urlString)
        if let existingTask = downloadTasks[key] {
            print("[AttachmentFileCache] Download already in progress")
            return try? await existingTask.value
        }

        // Start new download
        let task = Task<URL?, Error> {
            do {
                print("[AttachmentFileCache] Starting download...")

                // Create request with authentication header
                var request = URLRequest(url: url)
                request.httpMethod = "GET"

                // Add authentication token if available
                if let token = AuthenticationManager.shared.accessToken {
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    print("[AttachmentFileCache] Added auth token to request")
                } else {
                    print("[AttachmentFileCache] WARNING: No auth token available")
                }

                let (data, response) = try await URLSession.shared.data(for: request)

                // Validate response
                if let httpResponse = response as? HTTPURLResponse {
                    print("[AttachmentFileCache] HTTP status: \(httpResponse.statusCode)")
                    if !(200...299).contains(httpResponse.statusCode) {
                        print("[AttachmentFileCache] HTTP error \(httpResponse.statusCode) for \(absoluteURLString)")
                        return nil
                    }
                }

                print("[AttachmentFileCache] Downloaded \(data.count) bytes")

                // Save to disk
                try data.write(to: localURL, options: .atomic)
                print("[AttachmentFileCache] Saved to: \(localURL.path)")

                // Verify file exists
                if fileManager.fileExists(atPath: localURL.path) {
                    print("[AttachmentFileCache] File verified on disk")
                } else {
                    print("[AttachmentFileCache] WARNING: File not found after save!")
                }

                return localURL
            } catch {
                print("[AttachmentFileCache] Download failed for \(absoluteURLString): \(error)")
                return nil
            }
        }

        downloadTasks[key] = task

        defer {
            downloadTasks.removeValue(forKey: key)
        }

        return try? await task.value
    }

    /// Resolve a URL string to an absolute URL using EnvironmentConfig
    /// Handles all formats:
    /// - Complete URLs: "https://gate.meeshy.me/api/attachments/file/..."
    /// - Relative API paths: "/api/attachments/file/..."
    /// - Just file paths: "2024/11/userId/file.jpg"
    private func resolveToAbsoluteURL(_ urlString: String) async -> String {
        // Use centralized URL builder from EnvironmentConfig
        if let resolved = EnvironmentConfig.buildURL(urlString) {
            mediaLogger.info("📎 [AttachmentFileCache] URL resolved: \"\(urlString)\" → \"\(resolved)\"")
            return resolved
        }

        // Fallback: return as-is (will likely fail, but logged for debugging)
        mediaLogger.warn("📎 [AttachmentFileCache] Could not resolve URL: \(urlString)")
        return urlString
    }

    /// Cache file data directly (for files already downloaded)
    func cacheFile(data: Data, for urlString: String, type: CacheFileType? = nil) -> URL? {
        let fileType = type ?? CacheFileType.from(extension: URL(string: urlString)?.pathExtension ?? "")
        let ext = URL(string: urlString)?.pathExtension
        let localURL = fileURL(for: urlString, type: fileType, extension: ext)

        do {
            try data.write(to: localURL, options: .atomic)
            return localURL
        } catch {
            print("[AttachmentFileCache] Failed to cache file: \(error)")
            return nil
        }
    }

    /// Remove a specific cached file
    func removeFile(for urlString: String, type: CacheFileType? = nil) {
        if let localURL = getFile(for: urlString, type: type) {
            try? fileManager.removeItem(at: localURL)
        }
    }

    /// Clear cache for specific type
    func clearCache(for type: CacheFileType) {
        let dir = directory(for: type)
        try? fileManager.removeItem(at: dir)
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// Clear all attachment cache
    func clearAllCache() {
        try? fileManager.removeItem(at: baseCacheURL)
        createDirectoryStructure()
    }

    // MARK: - Statistics

    /// Get cache statistics
    func getStats() async -> AttachmentCacheStats {
        var totalSize: Int64 = 0
        var fileCount = 0
        var typeCounts: [CacheFileType: Int] = [:]

        for type in CacheFileType.allCases {
            typeCounts[type] = 0
        }

        for type in CacheFileType.allCases {
            let dir = directory(for: type)
            guard let enumerator = fileManager.enumerator(
                at: dir,
                includingPropertiesForKeys: [.fileSizeKey],
                options: [.skipsHiddenFiles]
            ) else { continue }

            for case let fileURL as URL in enumerator.allObjects {
                if let size = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    totalSize += Int64(size)
                    fileCount += 1
                    typeCounts[type, default: 0] += 1
                }
            }
        }

        return AttachmentCacheStats(
            totalSizeBytes: totalSize,
            fileCount: fileCount,
            imageCount: typeCounts[.image] ?? 0,
            videoCount: typeCounts[.video] ?? 0,
            audioCount: typeCounts[.audio] ?? 0,
            documentCount: typeCounts[.document] ?? 0,
            archiveCount: typeCounts[.archive] ?? 0,
            codeCount: typeCounts[.code] ?? 0,
            otherCount: typeCounts[.other] ?? 0
        )
    }

    /// Get formatted cache size
    func getCacheSizeFormatted() async -> String {
        let stats = await getStats()
        return stats.totalSizeFormatted
    }

    /// Get cache size for specific type
    func getCacheSize(for type: CacheFileType) async -> Int64 {
        var totalSize: Int64 = 0
        let dir = directory(for: type)

        guard let enumerator = fileManager.enumerator(
            at: dir,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }

        for case let fileURL as URL in enumerator.allObjects {
            if let size = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                totalSize += Int64(size)
            }
        }

        return totalSize
    }
}

// MARK: - Convenience Extensions

extension AttachmentFileCache {

    /// Get or download image (returns UIImage for convenience)
    func getOrDownloadImage(from urlString: String) async -> UIImage? {
        // Try to get from persistent cache
        if let localURL = getFile(for: urlString, type: .image),
           let data = try? Data(contentsOf: localURL),
           let image = UIImage(data: data) {
            return image
        }

        // Download and cache
        if let localURL = await downloadAndCache(from: urlString, type: .image),
           let data = try? Data(contentsOf: localURL),
           let image = UIImage(data: data) {
            return image
        }

        return nil
    }

    /// Get or download video (returns local URL)
    func getOrDownloadVideo(from urlString: String) async -> URL? {
        if let localURL = getFile(for: urlString, type: .video) {
            return localURL
        }
        return await downloadAndCache(from: urlString, type: .video)
    }

    /// Get or download audio (returns local URL)
    func getOrDownloadAudio(from urlString: String) async -> URL? {
        if let localURL = getFile(for: urlString, type: .audio) {
            return localURL
        }
        return await downloadAndCache(from: urlString, type: .audio)
    }

    /// Get or download document (returns local URL)
    func getOrDownloadDocument(from urlString: String) async -> URL? {
        let type = CacheFileType.from(extension: URL(string: urlString)?.pathExtension ?? "")
        if let localURL = getFile(for: urlString, type: type) {
            return localURL
        }
        return await downloadAndCache(from: urlString, type: type)
    }
}

// MARK: - SwiftUI View Helper

import SwiftUI

/// A view that loads and displays cached attachment content
struct CachedAttachmentView<Content: View, Placeholder: View>: View {
    let urlString: String
    let type: CacheFileType
    let content: (URL) -> Content
    let placeholder: () -> Placeholder

    @State private var localURL: URL?
    @State private var isLoading = false

    init(
        urlString: String,
        type: CacheFileType? = nil,
        @ViewBuilder content: @escaping (URL) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.urlString = urlString
        self.type = type ?? CacheFileType.from(extension: URL(string: urlString)?.pathExtension ?? "")
        self.content = content
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let localURL = localURL {
                content(localURL)
            } else {
                placeholder()
                    .onAppear {
                        loadAttachment()
                    }
            }
        }
        .onChange(of: urlString) { _, _ in
            localURL = nil
            loadAttachment()
        }
    }

    private func loadAttachment() {
        guard !isLoading else { return }
        isLoading = true

        Task {
            // Check cache first
            if let cached = await AttachmentFileCache.shared.getFile(for: urlString, type: type) {
                await MainActor.run {
                    self.localURL = cached
                    self.isLoading = false
                }
                return
            }

            // Download and cache
            let downloaded = await AttachmentFileCache.shared.downloadAndCache(from: urlString, type: type)
            await MainActor.run {
                self.localURL = downloaded
                self.isLoading = false
            }
        }
    }
}

// MARK: - Preview

#Preview("Attachment Cache Stats") {
    VStack(alignment: .leading, spacing: 12) {
        Text("Attachment Cache")
            .font(.headline)

        Text("Files are stored permanently in Documents/AttachmentCache/")
            .font(.caption)
            .foregroundColor(.secondary)

        Divider()

        VStack(alignment: .leading, spacing: 4) {
            Text("Supported Types:")
                .font(.subheadline.bold())

            ForEach(CacheFileType.allCases, id: \.self) { type in
                HStack {
                    Text(type.rawValue)
                        .font(.caption)
                    Spacer()
                    Text(type.extensions.prefix(5).joined(separator: ", "))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    .padding()
}
