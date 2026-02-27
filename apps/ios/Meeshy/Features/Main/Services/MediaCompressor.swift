import Foundation
import AVFoundation
import UIKit

struct CompressedImageResult {
    let data: Data
    let isHEIC: Bool
    var mimeType: String { isHEIC ? "image/heic" : "image/jpeg" }
    var fileExtension: String { isHEIC ? "heic" : "jpg" }
}

actor MediaCompressor {
    static let shared = MediaCompressor()

    func compressImage(_ image: UIImage, maxDimension: CGFloat = 2048, quality: CGFloat = 0.8) -> CompressedImageResult {
        let resized = resizeIfNeeded(image, maxDimension: maxDimension)
        return CompressedImageResult(data: resized.jpegData(compressionQuality: quality) ?? Data(), isHEIC: false)
    }

    func compressVideo(_ url: URL, preset: String = AVAssetExportPresetMediumQuality) async throws -> URL {
        let asset = AVURLAsset(url: url)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("compressed_\(UUID().uuidString).mp4")

        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
            throw CompressionError.exportSessionFailed
        }

        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        await session.export()

        guard session.status == .completed else {
            throw session.error ?? CompressionError.exportSessionFailed
        }

        return outputURL
    }

    private func resizeIfNeeded(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        guard size.width > maxDimension || size.height > maxDimension else { return image }

        let scale: CGFloat
        if size.width > size.height {
            scale = maxDimension / size.width
        } else {
            scale = maxDimension / size.height
        }

        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}

enum CompressionError: LocalizedError {
    case exportSessionFailed

    var errorDescription: String? {
        switch self {
        case .exportSessionFailed: return "Video compression failed"
        }
    }
}

// MARK: - UIImage HEIC Extension

private extension UIImage {
    func heicData(compressionQuality: CGFloat) -> Data? {
        guard let cgImage else { return nil }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, "public.heic" as CFString, 1, nil) else { return nil }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: compressionQuality]
        CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return data as Data
    }
}
