//
//  ImageCompressor.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import UIKit
import CoreImage

// MARK: - Image Resolution Presets

/// Available image resolution presets for compression
enum ImageResolution: String, CaseIterable, Identifiable {
    case small = "420p"      // 420px max dimension - Maximum compression (default)
    case medium = "720p"     // 720px max dimension - Balanced
    case large = "1024p"     // 1024px max dimension - Good quality
    case hd = "HD"           // 2048px max dimension - High definition

    var id: String { rawValue }

    /// Maximum dimension in pixels
    var maxDimension: CGFloat {
        switch self {
        case .small: return 420
        case .medium: return 720
        case .large: return 1024
        case .hd: return 2048
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

    /// Recommended JPEG quality for this resolution
    var recommendedQuality: CGFloat {
        switch self {
        case .small: return 0.5   // Maximum compression
        case .medium: return 0.6
        case .large: return 0.7
        case .hd: return 0.8
        }
    }

    /// Estimated file size multiplier (relative to small)
    var estimatedSizeMultiplier: Double {
        switch self {
        case .small: return 1.0
        case .medium: return 2.5
        case .large: return 5.0
        case .hd: return 12.0
        }
    }

    /// Default resolution - Maximum compression
    static var `default`: ImageResolution { .small }
}

enum CompressionQuality {
    case maximum   // 50% quality, maximum compression (default)
    case fast      // 60% quality, fast processing
    case balanced  // 70% quality, balanced
    case high      // 80% quality, best appearance

    var jpegQuality: CGFloat {
        switch self {
        case .maximum: return 0.5
        case .fast: return 0.6
        case .balanced: return 0.7
        case .high: return 0.8
        }
    }

    /// Default quality - Maximum compression
    static var `default`: CompressionQuality { .maximum }
}

struct CompressionResult {
    let data: Data
    let originalSize: Int64
    let compressedSize: Int64
    let compressionRatio: Double

    var savedBytes: Int64 {
        originalSize - compressedSize
    }

    var savedPercentage: Double {
        compressionRatio * 100
    }
}

final class ImageCompressor {

    // MARK: - Main Compression Method

    /// Compress image with resolution and quality settings
    /// - Parameters:
    ///   - image: The image to compress
    ///   - resolution: Target resolution preset (default: .small for maximum compression)
    ///   - maxSizeMB: Maximum file size in MB
    ///   - quality: Compression quality (default: .maximum)
    /// - Returns: CompressionResult with compressed data and statistics
    static func compress(
        _ image: UIImage,
        resolution: ImageResolution = .default,
        maxSizeMB: Double = 2.0,
        quality: CompressionQuality = .default
    ) -> CompressionResult? {
        guard let originalData = image.pngData() else { return nil }
        let originalSize = Int64(originalData.count)

        // Step 1: Resize to target resolution
        let resizedImage = resizeImage(image, maxDimension: resolution.maxDimension)

        // Step 2: Use resolution-recommended quality or provided quality
        let effectiveQuality = min(quality.jpegQuality, resolution.recommendedQuality)

        // Step 3: Compress to JPEG
        guard var compressedData = resizedImage.jpegData(compressionQuality: effectiveQuality) else {
            return nil
        }

        // Step 4: Further reduce if still too large
        let maxBytes = Int64(maxSizeMB * 1024 * 1024)
        var currentQuality = effectiveQuality

        while compressedData.count > maxBytes && currentQuality > 0.2 {
            currentQuality -= 0.1
            if let newData = resizedImage.jpegData(compressionQuality: currentQuality) {
                compressedData = newData
            } else {
                break
            }
        }

        let compressedSize = Int64(compressedData.count)
        let ratio = Double(originalSize - compressedSize) / Double(originalSize)

        return CompressionResult(
            data: compressedData,
            originalSize: originalSize,
            compressedSize: compressedSize,
            compressionRatio: ratio
        )
    }

    /// Legacy compress method for backward compatibility
    static func compress(
        _ image: UIImage,
        maxSizeMB: Double = 2.0,
        quality: CompressionQuality = .default
    ) -> CompressionResult? {
        return compress(image, resolution: .default, maxSizeMB: maxSizeMB, quality: quality)
    }

    /// Compress with specific resolution preset
    static func compress(
        _ image: UIImage,
        resolution: ImageResolution
    ) -> CompressionResult? {
        return compress(
            image,
            resolution: resolution,
            maxSizeMB: 2.0,
            quality: .default
        )
    }

    // MARK: - Thumbnail Generation

    static func generateThumbnail(_ image: UIImage, size: CGSize = CGSize(width: 256, height: 256)) -> UIImage? {
        let targetSize = calculateAspectFitSize(for: image.size, targetSize: size)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = false

        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)

        return renderer.image { context in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }

    // MARK: - Resize Image

    static func resizeImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size

        // If image is already smaller, return original
        if size.width <= maxDimension && size.height <= maxDimension {
            return image
        }

        // Calculate new size maintaining aspect ratio
        let aspectRatio = size.width / size.height
        var newSize: CGSize

        if size.width > size.height {
            newSize = CGSize(width: maxDimension, height: maxDimension / aspectRatio)
        } else {
            newSize = CGSize(width: maxDimension * aspectRatio, height: maxDimension)
        }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = false

        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)

        return renderer.image { context in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    // MARK: - Helper Methods

    private static func calculateAspectFitSize(for originalSize: CGSize, targetSize: CGSize) -> CGSize {
        let widthRatio = targetSize.width / originalSize.width
        let heightRatio = targetSize.height / originalSize.height
        let scaleFactor = min(widthRatio, heightRatio)

        return CGSize(
            width: originalSize.width * scaleFactor,
            height: originalSize.height * scaleFactor
        )
    }

    // MARK: - Batch Processing

    static func compressBatch(
        _ images: [UIImage],
        resolution: ImageResolution = .default,
        maxSizeMB: Double = 2.0,
        quality: CompressionQuality = .default
    ) async -> [CompressionResult] {
        await withTaskGroup(of: CompressionResult?.self) { group in
            for image in images {
                group.addTask {
                    compress(image, resolution: resolution, maxSizeMB: maxSizeMB, quality: quality)
                }
            }

            var results: [CompressionResult] = []
            for await result in group {
                if let result = result {
                    results.append(result)
                }
            }
            return results
        }
    }

    // MARK: - Image Format Detection

    static func detectImageFormat(_ data: Data) -> String? {
        guard data.count > 12 else { return nil }

        let bytes = [UInt8](data.prefix(12))

        // JPEG
        if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
            return "JPEG"
        }

        // PNG
        if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
            return "PNG"
        }

        // GIF
        if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 {
            return "GIF"
        }

        // WebP
        if bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50 {
            return "WebP"
        }

        return nil
    }

    // MARK: - Progressive JPEG

    static func createProgressiveJPEG(_ image: UIImage, quality: CompressionQuality = .balanced) -> Data? {
        guard let ciImage = CIImage(image: image) else { return nil }

        let context = CIContext()
        let options: [CIImageRepresentationOption: Any] = [
            kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: quality.jpegQuality
        ]

        return context.jpegRepresentation(of: ciImage, colorSpace: CGColorSpaceCreateDeviceRGB(), options: options)
    }
}

// MARK: - UIImage Extensions

extension UIImage {
    /// Compress image with resolution preset (default: maximum compression at 420p)
    func compressed(
        resolution: ImageResolution = .default,
        maxSizeMB: Double = 2.0,
        quality: CompressionQuality = .default
    ) -> Data? {
        ImageCompressor.compress(self, resolution: resolution, maxSizeMB: maxSizeMB, quality: quality)?.data
    }

    /// Compress with specific resolution preset
    func compressed(resolution: ImageResolution) -> Data? {
        ImageCompressor.compress(self, resolution: resolution)?.data
    }

    func thumbnail(size: CGSize = CGSize(width: 256, height: 256)) -> UIImage? {
        ImageCompressor.generateThumbnail(self, size: size)
    }

    func resized(maxDimension: CGFloat) -> UIImage {
        ImageCompressor.resizeImage(self, maxDimension: maxDimension)
    }

    /// Resize to specific resolution preset
    func resized(to resolution: ImageResolution) -> UIImage {
        ImageCompressor.resizeImage(self, maxDimension: resolution.maxDimension)
    }
}
