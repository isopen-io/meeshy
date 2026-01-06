//
//  VideoCompressor.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//  Updated: 2025-12-06 - Swift 6 Sendable compliance, improved progress tracking
//

import AVFoundation
import UIKit
import CoreMedia

// MARK: - Video Resolution Presets

/// Available video resolution presets for compression
enum VideoResolution: String, CaseIterable, Identifiable, Sendable {
    case small = "420p"      // 420px max dimension - Maximum compression
    case medium = "720p"     // 720px max dimension - Balanced
    case large = "1024p"     // 1024px max dimension - Good quality
    case hd = "HD"           // 1920px max dimension - High definition (default)

    var id: String { rawValue }

    /// Maximum dimension in pixels
    var maxDimension: CGFloat {
        switch self {
        case .small: return 420
        case .medium: return 720
        case .large: return 1024
        case .hd: return 1920
        }
    }

    /// Display name for UI
    var displayName: String {
        switch self {
        case .small: return "420p (Très compressé)"
        case .medium: return "720p (Équilibré)"
        case .large: return "1024p (Bonne qualité)"
        case .hd: return "HD (Haute définition)"
        }
    }

    /// Target bitrate for this resolution
    var bitrate: Int {
        switch self {
        case .small: return 500_000       // 0.5 Mbps
        case .medium: return 1_500_000    // 1.5 Mbps
        case .large: return 3_000_000     // 3 Mbps
        case .hd: return 5_000_000        // 5 Mbps
        }
    }

    /// AVAssetExportSession preset
    var exportPreset: String {
        switch self {
        case .small: return AVAssetExportPresetLowQuality
        case .medium: return AVAssetExportPreset960x540
        case .large: return AVAssetExportPreset1280x720
        case .hd: return AVAssetExportPreset1920x1080
        }
    }

    /// Fallback preset if primary not available
    var fallbackPreset: String {
        switch self {
        case .small: return AVAssetExportPresetLowQuality
        case .medium: return AVAssetExportPresetMediumQuality
        case .large: return AVAssetExportPresetMediumQuality
        case .hd: return AVAssetExportPresetHighestQuality
        }
    }

    /// Estimated file size multiplier (relative to small)
    var estimatedSizeMultiplier: Double {
        switch self {
        case .small: return 1.0
        case .medium: return 3.0
        case .large: return 6.0
        case .hd: return 12.0
        }
    }

    /// Default resolution for video - HD
    static var `default`: VideoResolution { .hd }
}

enum VideoQuality: Sendable {
    case low        // 480p, 1 Mbps
    case medium     // 720p, 2.5 Mbps
    case high       // 1080p, 5 Mbps

    var preset: String {
        switch self {
        case .low: return AVAssetExportPresetLowQuality
        case .medium: return AVAssetExportPresetMediumQuality
        case .high: return AVAssetExportPresetHighestQuality
        }
    }

    var bitrate: Int {
        switch self {
        case .low: return 1_000_000      // 1 Mbps
        case .medium: return 2_500_000   // 2.5 Mbps
        case .high: return 5_000_000     // 5 Mbps
        }
    }

    var maxDimension: CGFloat {
        switch self {
        case .low: return 640     // 480p equivalent
        case .medium: return 1280 // 720p
        case .high: return 1920   // 1080p
        }
    }

    /// Convert to VideoResolution
    var resolution: VideoResolution {
        switch self {
        case .low: return .small
        case .medium: return .medium
        case .high: return .hd
        }
    }
}

struct VideoMetadata: Sendable {
    let duration: TimeInterval
    let resolution: CGSize
    let fileSize: Int64
    let codec: String
    let fps: Float
    let bitrate: Float
    let isPortrait: Bool
    let hasAudioTrack: Bool

    var durationFormatted: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    var fileSizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: fileSize, countStyle: .file)
    }

    var resolutionFormatted: String {
        "\(Int(resolution.width))x\(Int(resolution.height))"
    }
}

enum VideoCompressionError: LocalizedError, Sendable {
    case invalidURL
    case exportFailed(String)
    case cancelled
    case unsupportedFormat
    case noVideoTrack

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid video URL"
        case .exportFailed(let detail): return "Failed to compress video: \(detail)"
        case .cancelled: return "Compression cancelled"
        case .unsupportedFormat: return "Unsupported video format"
        case .noVideoTrack: return "No video track found"
        }
    }
}

final class VideoCompressor: Sendable {

    // MARK: - Main Compression Method (Resolution-based)

    /// Compress video to specified resolution with async/await and Sendable-compliant progress handler
    /// - Parameters:
    ///   - url: Source video URL
    ///   - resolution: Target resolution preset (default: .hd)
    ///   - progressHandler: Called with progress 0.0 to 1.0 (Sendable-compliant)
    /// - Returns: URL of compressed video
    static func compress(
        _ url: URL,
        resolution: VideoResolution = .default,
        progressHandler: (@Sendable (Double) -> Void)? = nil
    ) async throws -> URL {
        let asset = AVAsset(url: url)

        // Verify asset is readable
        guard try await asset.load(.isReadable) else {
            throw VideoCompressionError.invalidURL
        }

        // Try primary preset, fallback if not available
        var presetName = resolution.exportPreset
        let compatiblePresets = AVAssetExportSession.exportPresets(compatibleWith: asset)

        if !compatiblePresets.contains(presetName) {
            presetName = resolution.fallbackPreset
            mediaLogger.info("[VideoCompressor] Using fallback preset: \(presetName)")
        }

        // Create export session
        guard let exportSession = AVAssetExportSession(
            asset: asset,
            presetName: presetName
        ) else {
            throw VideoCompressionError.exportFailed("Could not create export session")
        }

        // Configure output
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true

        // Swift 6 compliant progress monitoring using Task instead of Timer
        let progressTask = Task { @Sendable in
            while !Task.isCancelled {
                let progress = Double(exportSession.progress)
                progressHandler?(progress)

                // Check if export is complete
                if exportSession.status == .completed ||
                   exportSession.status == .failed ||
                   exportSession.status == .cancelled {
                    break
                }

                try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            }
        }

        // Export
        await exportSession.export()

        // Cancel progress monitoring
        progressTask.cancel()
        progressHandler?(1.0) // Ensure we report 100%

        // Check status
        switch exportSession.status {
        case .completed:
            mediaLogger.info("[VideoCompressor] Compression completed (\(resolution.rawValue)): \(outputURL.lastPathComponent)")
            return outputURL

        case .cancelled:
            throw VideoCompressionError.cancelled

        case .failed:
            let errorMsg = exportSession.error?.localizedDescription ?? "Unknown error"
            mediaLogger.error("[VideoCompressor] Compression failed: \(errorMsg)")
            throw VideoCompressionError.exportFailed(errorMsg)

        default:
            throw VideoCompressionError.exportFailed("Unknown status: \(exportSession.status.rawValue)")
        }
    }

    /// Legacy compress method for backward compatibility
    static func compress(
        _ url: URL,
        quality: VideoQuality = .medium,
        progressHandler: (@Sendable (Double) -> Void)? = nil
    ) async throws -> URL {
        return try await compress(url, resolution: quality.resolution, progressHandler: progressHandler)
    }

    // MARK: - Thumbnail Generation
 
    static func generateThumbnail(
        _ url: URL,
        at time: CMTime = .zero
    ) async throws -> UIImage? {
        let asset = AVAsset(url: url)
        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        imageGenerator.maximumSize = CGSize(width: 512, height: 512)

        let cgImage = try await imageGenerator.image(at: time).image
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Multiple Thumbnails

    static func generateThumbnails(
        _ url: URL,
        count: Int = 10
    ) async throws -> [UIImage] {
        let asset = AVAsset(url: url)
        let duration = try await asset.load(.duration)
        let durationSeconds = CMTimeGetSeconds(duration)

        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        imageGenerator.maximumSize = CGSize(width: 256, height: 256)

        var thumbnails: [UIImage] = []

        for i in 0..<count {
            let timeValue = durationSeconds * Double(i) / Double(count)
            let time = CMTime(seconds: timeValue, preferredTimescale: 600)

            if let cgImage = try? await imageGenerator.image(at: time).image {
                thumbnails.append(UIImage(cgImage: cgImage))
            }
        }

        return thumbnails
    }

    // MARK: - Extract Metadata

    /// Extract comprehensive video metadata including orientation and audio track info
    static func extractMetadata(_ url: URL) async throws -> VideoMetadata {
        let asset = AVAsset(url: url)

        // Load all required properties
        let duration = try await asset.load(.duration)
        let tracks = try await asset.load(.tracks)

        guard let videoTrack = tracks.first(where: { $0.mediaType == .video }) else {
            throw VideoCompressionError.noVideoTrack
        }

        // Check for audio track
        let hasAudioTrack = tracks.contains { $0.mediaType == .audio }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
        let estimatedDataRate = try await videoTrack.load(.estimatedDataRate)
        let preferredTransform = try await videoTrack.load(.preferredTransform)

        // Determine orientation based on transform
        let isPortrait = preferredTransform.a == 0 && preferredTransform.d == 0

        // Calculate actual display size considering transform
        let displaySize: CGSize
        if isPortrait {
            displaySize = CGSize(width: naturalSize.height, height: naturalSize.width)
        } else {
            displaySize = naturalSize
        }

        // Get file size
        let fileSize = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0

        // Detect codec
        let formatDescriptions = try await videoTrack.load(.formatDescriptions)
        var codec = "Unknown"
        if let formatDescription = formatDescriptions.first {
            let codecType = CMFormatDescriptionGetMediaSubType(formatDescription as! CMFormatDescription)
            codec = fourCharCodeToString(codecType)
        }

        return VideoMetadata(
            duration: CMTimeGetSeconds(duration),
            resolution: displaySize,
            fileSize: fileSize,
            codec: codec,
            fps: nominalFrameRate,
            bitrate: estimatedDataRate,
            isPortrait: isPortrait,
            hasAudioTrack: hasAudioTrack
        )
    }

    // MARK: - Helper Methods

    private static func calculateRenderSize(
        for asset: AVAsset,
        quality: VideoQuality
    ) async throws -> CGSize {
        let tracks = try await asset.load(.tracks)
        guard let videoTrack = tracks.first(where: { $0.mediaType == .video }) else {
            throw VideoCompressionError.unsupportedFormat
        }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let preferredTransform = try await videoTrack.load(.preferredTransform)

        // Adjust size based on quality
        let maxDimension: CGFloat = switch quality {
        case .low: 640     // 480p equivalent
        case .medium: 1280 // 720p
        case .high: 1920   // 1080p
        }

        // Apply transform to get correct dimensions
        let size = naturalSize.applying(preferredTransform)
        let width = abs(size.width)
        let height = abs(size.height)

        if width > maxDimension || height > maxDimension {
            let aspectRatio = width / height
            if width > height {
                return CGSize(width: maxDimension, height: maxDimension / aspectRatio)
            } else {
                return CGSize(width: maxDimension * aspectRatio, height: maxDimension)
            }
        }

        return CGSize(width: width, height: height)
    }

    private static func fourCharCodeToString(_ code: FourCharCode) -> String {
        let bytes: [UInt8] = [
            UInt8((code >> 24) & 0xFF),
            UInt8((code >> 16) & 0xFF),
            UInt8((code >> 8) & 0xFF),
            UInt8(code & 0xFF)
        ]
        return String(bytes: bytes, encoding: .ascii) ?? "Unknown"
    }

    // MARK: - Trim Video

    /// Trim video with resolution preset (default: HD)
    static func trim(
        _ url: URL,
        start: CMTime,
        end: CMTime,
        resolution: VideoResolution = .default
    ) async throws -> URL {
        let asset = AVAsset(url: url)

        // Try primary preset, fallback if not available
        var presetName = resolution.exportPreset
        let compatiblePresets = AVAssetExportSession.exportPresets(compatibleWith: asset)

        if !compatiblePresets.contains(presetName) {
            presetName = resolution.fallbackPreset
        }

        guard let exportSession = AVAssetExportSession(
            asset: asset,
            presetName: presetName
        ) else {
            throw VideoCompressionError.exportFailed("Failed to create export session")
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.timeRange = CMTimeRange(start: start, end: end)
        exportSession.shouldOptimizeForNetworkUse = true

        await exportSession.export()

        if exportSession.status == .completed {
            return outputURL
        } else {
            throw exportSession.error ?? VideoCompressionError.exportFailed("Export failed with unknown error")
        }
    }

    /// Legacy trim method for backward compatibility
    static func trim(
        _ url: URL,
        start: CMTime,
        end: CMTime,
        quality: VideoQuality = .medium
    ) async throws -> URL {
        return try await trim(url, start: start, end: end, resolution: quality.resolution)
    }
}
