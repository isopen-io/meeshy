import Foundation
import AVFoundation
import UIKit
import ImageIO
import VideoToolbox
import os

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

// MARK: - Media Context

nonisolated enum MediaContext: Sendable {
    case message
    case story
    case feedPost
    case avatar
    case fullscreen

    var maxImageDimension: CGFloat {
        switch self {
        case .message:    return 1200
        case .story:      return 1080
        case .feedPost:   return 1600
        case .avatar:     return 512
        case .fullscreen: return 2048
        }
    }

    var videoBitRate: Int {
        switch self {
        case .message:    return 2_500_000
        case .story:      return 4_000_000
        case .feedPost:   return 4_000_000
        case .avatar:     return 1_000_000
        case .fullscreen: return 8_000_000
        }
    }

    var maxVideoResolution: CGSize {
        switch self {
        case .message:    return CGSize(width: 720, height: 1280)
        case .story:      return CGSize(width: 1080, height: 1920)
        case .feedPost:   return CGSize(width: 1080, height: 1920)
        case .avatar:     return CGSize(width: 480, height: 480)
        case .fullscreen: return CGSize(width: 1920, height: 1080)
        }
    }

    var audioBitRate: Int {
        switch self {
        case .story:      return 128_000
        case .fullscreen: return 128_000
        default:          return 96_000
        }
    }
}

// MARK: - Sendable Wrappers for AVFoundation types

private nonisolated struct SendableTrackOutput: @unchecked Sendable {
    let value: AVAssetReaderTrackOutput
}

private nonisolated struct SendableWriterInput: @unchecked Sendable {
    let value: AVAssetWriterInput
}

// MARK: - MediaCompressor

actor MediaCompressor {
    static let shared = MediaCompressor()

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "media-compressor")

    // MARK: - From UIImage (format already lost) → always JPEG

    func compressImage(_ image: UIImage, maxDimension: CGFloat = 2048, quality: CGFloat = 0.8) -> CompressedImageResult {
        let size = image.size
        let needsResize = size.width > maxDimension || size.height > maxDimension

        if needsResize {
            guard let data = image.jpegData(compressionQuality: 1.0) else {
                return CompressedImageResult(data: Data(), mimeType: "image/jpeg")
            }
            guard let downsampled = downsample(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: "image/jpeg")
            }
            let jpeg = downsampled.jpegData(compressionQuality: quality) ?? Data()
            return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")
        }

        let jpeg = image.jpegData(compressionQuality: quality) ?? Data()
        return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")
    }

    // MARK: - From raw Data (preserves format, hardware-accelerated downsampling)

    func compressImageData(_ data: Data, maxDimension: CGFloat = 2048, quality: CGFloat = 0.8) -> CompressedImageResult {
        let mime = detectMimeType(data)

        switch mime {
        case "image/gif", "image/webp":
            return CompressedImageResult(data: data, mimeType: mime)

        case "image/png":
            guard needsResize(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: "image/png")
            }
            guard let downsampled = downsample(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: "image/png")
            }
            let png = downsampled.pngData() ?? data
            return CompressedImageResult(data: png, mimeType: "image/png")

        case "image/heic", "image/heif":
            guard let downsampled = downsample(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: mime)
            }
            let compressed = downsampled.heicData(compressionQuality: quality) ?? data
            return CompressedImageResult(data: compressed, mimeType: mime)

        default:
            guard let downsampled = downsample(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: "image/jpeg")
            }
            let jpeg = downsampled.jpegData(compressionQuality: quality) ?? data
            return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")
        }
    }

    // MARK: - Video (AVAssetWriter with HEVC + adaptive bitrate)

    func compressVideo(_ url: URL, context: MediaContext = .message) async throws -> URL {
        let asset = AVURLAsset(url: url)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("compressed_\(UUID().uuidString).mp4")

        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw CompressionError.noVideoTrack
        }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(.preferredTransform)
        let isPortrait = abs(transform.b) == 1 && abs(transform.c) == 1
        let sourceSize = isPortrait
            ? CGSize(width: naturalSize.height, height: naturalSize.width)
            : naturalSize

        let targetSize = fitSize(sourceSize, within: context.maxVideoResolution)
        let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
        let targetFPS = min(nominalFrameRate, 30)

        let useHEVC = VTIsHardwareDecodeSupported(kCMVideoCodecType_HEVC)
        let codecType: AVVideoCodecType = useHEVC ? .hevc : .h264

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: codecType,
            AVVideoWidthKey: Int(targetSize.width),
            AVVideoHeightKey: Int(targetSize.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: context.videoBitRate,
                AVVideoExpectedSourceFrameRateKey: targetFPS,
                AVVideoProfileLevelKey: useHEVC
                    ? kVTProfileLevel_HEVC_Main_AutoLevel as String
                    : AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: Int(targetFPS) * 2,
            ] as [String: Any]
        ]

        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = false
        videoInput.transform = transform
        writer.add(videoInput)

        var audioInput: AVAssetWriterInput?
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        if !audioTracks.isEmpty {
            let audioSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: context.audioBitRate,
            ]
            let aInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            aInput.expectsMediaDataInRealTime = false
            writer.add(aInput)
            audioInput = aInput
        }

        let reader = try AVAssetReader(asset: asset)

        let videoOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        ])
        reader.add(videoOutput)

        var audioOutput: AVAssetReaderTrackOutput?
        if let audioTrack = audioTracks.first {
            let aOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
            ])
            reader.add(aOutput)
            audioOutput = aOutput
        }

        reader.startReading()
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        let vOut = SendableTrackOutput(value: videoOutput)
        let vIn = SendableWriterInput(value: videoInput)
        let aOut = audioOutput.map { SendableTrackOutput(value: $0) }
        let aIn = audioInput.map { SendableWriterInput(value: $0) }
        await Self.transferSamples(from: vOut.value, to: vIn.value)
        if let aOut, let aIn {
            await Self.transferSamples(from: aOut.value, to: aIn.value)
        }

        await writer.finishWriting()

        guard writer.status == .completed else {
            throw writer.error ?? CompressionError.exportSessionFailed
        }

        Self.logger.info("Video compressed: \(codecType == .hevc ? "HEVC" : "H.264", privacy: .public) \(Int(targetSize.width))x\(Int(targetSize.height)) @ \(context.videoBitRate / 1000)kbps")

        return outputURL
    }

    // MARK: - Legacy preset-based compression (fallback)

    func compressVideoLegacy(_ url: URL, preset: String = AVAssetExportPresetMediumQuality) async throws -> URL {
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

    // MARK: - ImageIO hardware-accelerated downsampling

    private func downsample(data: Data, maxDimension: CGFloat) -> UIImage? {
        let sourceOptions: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions as CFDictionary) else {
            return nil
        }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    private func needsResize(data: Data, maxDimension: CGFloat) -> Bool {
        let sourceOptions: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? CGFloat,
              let height = properties[kCGImagePropertyPixelHeight] as? CGFloat else {
            return false
        }
        return width > maxDimension || height > maxDimension
    }

    // MARK: - Video helpers

    private func fitSize(_ source: CGSize, within max: CGSize) -> CGSize {
        guard source.width > max.width || source.height > max.height else {
            return CGSize(width: evenNumber(source.width), height: evenNumber(source.height))
        }
        let scaleW = max.width / source.width
        let scaleH = max.height / source.height
        let scale = min(scaleW, scaleH)
        return CGSize(
            width: evenNumber(source.width * scale),
            height: evenNumber(source.height * scale)
        )
    }

    private func evenNumber(_ value: CGFloat) -> CGFloat {
        let rounded = Int(value)
        return CGFloat(rounded % 2 == 0 ? rounded : rounded - 1)
    }

    private static func transferSamples(from output: AVAssetReaderTrackOutput, to input: AVAssetWriterInput) async {
        let wrappedInput = SendableWriterInput(value: input)
        let wrappedOutput = SendableTrackOutput(value: output)
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            nonisolated(unsafe) var finished = false
            nonisolated(unsafe) let inp = wrappedInput.value
            nonisolated(unsafe) let out = wrappedOutput.value
            inp.requestMediaDataWhenReady(on: DispatchQueue(label: "me.meeshy.media-compressor.\(inp.mediaType.rawValue)")) {
                while inp.isReadyForMoreMediaData {
                    guard !finished else { return }
                    guard let sample = out.copyNextSampleBuffer() else {
                        finished = true
                        inp.markAsFinished()
                        continuation.resume()
                        return
                    }
                    inp.append(sample)
                }
            }
        }
    }

    // MARK: - MIME detection

    private func detectMimeType(_ data: Data) -> String {
        guard data.count >= 12 else { return "image/jpeg" }
        let bytes = [UInt8](data.prefix(12))

        if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
            return "image/jpeg"
        }
        if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
            return "image/png"
        }
        if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38 {
            return "image/gif"
        }
        if bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
           bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50 {
            return "image/webp"
        }
        if bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70 {
            return "image/heic"
        }

        return "image/jpeg"
    }
}

// MARK: - Compression Errors

enum CompressionError: LocalizedError {
    case exportSessionFailed
    case noVideoTrack

    var errorDescription: String? {
        switch self {
        case .exportSessionFailed: return "Video compression failed"
        case .noVideoTrack: return "No video track found in source file"
        }
    }
}

// MARK: - UIImage HEIC Extension

private nonisolated extension UIImage {
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
