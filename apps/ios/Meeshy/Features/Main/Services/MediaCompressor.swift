import Foundation
import AVFoundation
import UIKit
import ImageIO

struct CompressedImageResult {
    let data: Data
    let mimeType: String

    var fileExtension: String {
        switch mimeType {
        case "image/jpeg":  return "jpg"
        case "image/png":   return "png"
        case "image/gif":   return "gif"
        case "image/webp":  return "webp"
        default:            return "jpg"
        }
    }
}

actor MediaCompressor {
    static let shared = MediaCompressor()

    // MARK: - From UIImage (format already lost) → always JPEG

    func compressImage(_ image: UIImage, maxDimension: CGFloat = 2048, quality: CGFloat = 0.8) -> CompressedImageResult {
        let resized = resizeIfNeeded(image, maxDimension: maxDimension)
        let data = resized.jpegData(compressionQuality: quality) ?? Data()
        return CompressedImageResult(data: data, mimeType: "image/jpeg")
    }

    // MARK: - From raw Data (preserves format, compresses HEIC/HEIF if system APIs available)

    func compressImageData(_ data: Data, maxDimension: CGFloat = 2048, quality: CGFloat = 0.8) -> CompressedImageResult {
        let mime = detectMimeType(data)

        switch mime {
        case "image/heic", "image/heif":
            guard let image = UIImage(data: data) else {
                return CompressedImageResult(data: data, mimeType: mime)
            }
            let resized = resizeIfNeeded(image, maxDimension: maxDimension)
            let compressed = resized.heicData(compressionQuality: quality) ?? data
            return CompressedImageResult(data: compressed, mimeType: mime)

        case "image/jpeg":
            guard let image = UIImage(data: data) else {
                return CompressedImageResult(data: data, mimeType: "image/jpeg")
            }
            let resized = resizeIfNeeded(image, maxDimension: maxDimension)
            let jpeg = resized.jpegData(compressionQuality: quality) ?? data
            return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")

        case "image/png":
            guard let image = UIImage(data: data),
                  image.size.width > maxDimension || image.size.height > maxDimension else {
                return CompressedImageResult(data: data, mimeType: "image/png")
            }
            let resized = resizeIfNeeded(image, maxDimension: maxDimension)
            let png = resized.pngData() ?? data
            return CompressedImageResult(data: png, mimeType: "image/png")

        case "image/gif", "image/webp":
            return CompressedImageResult(data: data, mimeType: mime)

        default:
            guard let image = UIImage(data: data) else {
                return CompressedImageResult(data: data, mimeType: "image/jpeg")
            }
            let resized = resizeIfNeeded(image, maxDimension: maxDimension)
            let jpeg = resized.jpegData(compressionQuality: quality) ?? data
            return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")
        }
    }

    // MARK: - Video

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

    // MARK: - Private helpers

    private func resizeIfNeeded(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        guard size.width > maxDimension || size.height > maxDimension else { return image }

        let scale = size.width > size.height ? maxDimension / size.width : maxDimension / size.height
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    private func detectMimeType(_ data: Data) -> String {
        guard data.count >= 12 else { return "image/jpeg" }
        let bytes = [UInt8](data.prefix(12))

        // JPEG: FF D8 FF
        if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
            return "image/jpeg"
        }
        // PNG: 89 50 4E 47
        if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
            return "image/png"
        }
        // GIF: 47 49 46 38
        if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38 {
            return "image/gif"
        }
        // WebP: RIFF....WEBP
        if bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
           bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50 {
            return "image/webp"
        }
        // HEIC/HEIF: ftyp box at offset 4 (00 00 00 xx 66 74 79 70)
        if bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70 {
            return "image/heic"
        }

        return "image/jpeg"
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
