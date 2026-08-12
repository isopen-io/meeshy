import Foundation
import AVFoundation
import UIKit
import ImageIO
import VideoToolbox
import MeeshySDK
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
            // Single-pass downsample via CGImage. Previously this path went
            // image → JPEG@1.0 → downsample(data) → JPEG@0.8, encoding the
            // pixel buffer to JPEG TWICE (~150ms wasted on a 4K image). Now we
            // bypass the round-trip by feeding the CGImage straight to
            // ImageIO via `downsample(cgImage:)`.
            if let cg = image.cgImage,
               let downsampled = downsample(cgImage: cg, maxDimension: maxDimension) {
                let jpeg = downsampled.jpegData(compressionQuality: quality) ?? Data()
                return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")
            }
            // Fallback: legacy data-roundtrip path if CGImage isn't available.
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

        // HEIC/HEIF ("High Efficiency" camera capture) falls straight through
        // to `default`: most web clients (and non-Apple browsers) cannot
        // decode HEIC inline, so re-encoding it as HEIC here would leave a
        // format the web can't render regardless of file extension. The
        // default branch already transcodes to a real JPEG stream with a
        // matching mimeType/extension — reusing it fixes both the mismatched
        // `.jpg` extension AND actual cross-platform rendering in one move.
        //
        // On transcode failure (corrupt/exotic source), both fallbacks below
        // return the UNTOUCHED original bytes tagged with the ORIGINALLY
        // detected `mime` — never hardcode "image/jpeg" here, or real HEIC
        // bytes end up mislabeled on the failure path (the mismatch this
        // branch exists to eliminate on the success path).
        default:
            guard let downsampled = downsample(data: data, maxDimension: maxDimension) else {
                return CompressedImageResult(data: data, mimeType: mime)
            }
            guard let jpeg = downsampled.jpegData(compressionQuality: quality) else {
                return CompressedImageResult(data: data, mimeType: mime)
            }
            return CompressedImageResult(data: jpeg, mimeType: "image/jpeg")
        }
    }

    // MARK: - Video (AVAssetWriter with HEVC + adaptive bitrate)

    func compressVideo(_ url: URL, context: MediaContext = .message) async throws -> URL {
        let asset = AVURLAsset(url: url)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("compressed_\(UUID().uuidString).mp4")

        // **Fast-path SOTA** : si la source est déjà au format cible
        // (codec HEVC/H.264 + résolution ≤ budget + bitrate ≤ budget × 2),
        // on **remux** au lieu de transcoder. Sur iPhone Camera (HEVC
        // 1080p ~15 Mbps) qui dépasse à peine le budget story (4 Mbps),
        // on accepte la surface ratio bitrate × 2 — l'économie de
        // décodage + re-encodage vaut bien quelques MB de plus.
        //
        // Coût : un remux d'un .mp4 de 14 s = ~1 s (juste copie des
        // sample buffers entre 2 containers MP4, pas de Video Toolbox
        // appelé). Sans ça, on payait ~10–60 s de re-encodage HEVC
        // selon la charge thermique du device.
        if let fastPath = try? await passthroughIfPossible(
            asset: asset,
            sourceURL: url,
            outputURL: outputURL,
            context: context
        ) {
            return fastPath
        }

        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw CompressionError.noVideoTrack
        }

        // **Le writer encode les pixel buffers RAW** (orientation sensor),
        // pas l'image displayée — la rotation est appliquée en metadata via
        // `videoInput.transform`. Donc les dims du writer doivent matcher
        // les dims des sample buffers source, sinon l'encoder force-rescale
        // entre deux ratios incompatibles (ex. 1920×1080 raw → 1080×1920
        // demandé = stretch 16:9 → 9:16). C'était la régression du
        // 2026-04-30 quand `naturalDisplaySize()` a remplacé `naturalSize`.
        //
        // Le budget `maxVideoResolution` reste exprimé côté display (1080×
        // 1920 pour story portrait), donc on fait le fit en coordonnées
        // display puis on swap back en raw pour le writer.
        let rawSourceSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(.preferredTransform)
        let isPortraitDisplay = abs(transform.b) == 1 && abs(transform.c) == 1
        let displaySourceSize = isPortraitDisplay
            ? CGSize(width: rawSourceSize.height, height: rawSourceSize.width)
            : rawSourceSize
        let targetDisplaySize = fitSize(displaySourceSize, within: context.maxVideoResolution)
        let targetRawSize = isPortraitDisplay
            ? CGSize(width: targetDisplaySize.height, height: targetDisplaySize.width)
            : targetDisplaySize

        let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
        let targetFPS = min(nominalFrameRate, 30)

        let useHEVC = VTIsHardwareDecodeSupported(kCMVideoCodecType_HEVC)
        let codecType: AVVideoCodecType = useHEVC ? .hevc : .h264

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: codecType,
            AVVideoWidthKey: Int(targetRawSize.width),
            AVVideoHeightKey: Int(targetRawSize.height),
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

        // **Parallélisation video + audio**. Avant on transferait
        // séquentiellement (video puis audio) : sur un clip 30 s avec
        // audio non trivial, l'audio attendait ~ durée du clip avant
        // de commencer son pass. AVAssetReader et AVAssetWriter
        // supportent des reads/writes concurrents sur des tracks
        // distinctes (chaque track output a sa propre queue interne).
        // `async let` les lance en parallèle, on attend la jointure.
        async let videoTask: Void = Self.transferSamples(from: vOut.value, to: vIn.value)
        async let audioTask: Void = {
            guard let aOut, let aIn else { return }
            await Self.transferSamples(from: aOut.value, to: aIn.value)
        }()
        _ = await (videoTask, audioTask)

        await writer.finishWriting()

        guard writer.status == .completed else {
            throw writer.error ?? CompressionError.exportSessionFailed
        }

        Self.logger.info("Video compressed: \(codecType == .hevc ? "HEVC" : "H.264", privacy: .public) \(Int(targetDisplaySize.width))x\(Int(targetDisplaySize.height)) display (\(Int(targetRawSize.width))x\(Int(targetRawSize.height)) raw) @ \(context.videoBitRate / 1000)kbps")

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

    /// Single-pass CGImage downsample using ImageIO. Skips the JPEG@1.0 round-trip
    /// that the data-based variant requires when the caller already holds a CGImage
    /// (via `UIImage.cgImage`). Cuts ~150ms on a 4K source.
    private func downsample(cgImage: CGImage, maxDimension: CGFloat) -> UIImage? {
        let renderer = UIGraphicsImageRenderer(size: targetSize(for: cgImage, maxDimension: maxDimension))
        let downsampled = renderer.image { ctx in
            ctx.cgContext.interpolationQuality = .high
            UIImage(cgImage: cgImage).draw(in: CGRect(origin: .zero, size: renderer.format.bounds.size))
        }
        return downsampled
    }

    private func targetSize(for cgImage: CGImage, maxDimension: CGFloat) -> CGSize {
        let w = CGFloat(cgImage.width)
        let h = CGFloat(cgImage.height)
        let longest = max(w, h)
        guard longest > maxDimension else { return CGSize(width: w, height: h) }
        let scale = maxDimension / longest
        return CGSize(width: floor(w * scale), height: floor(h * scale))
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

    // MARK: - Passthrough fast-path

    /// Si la source est déjà compatible avec le budget cible (codec moderne,
    /// résolution & bitrate dans les clous), remuxe vers `outputURL` via
    /// `AVAssetExportPresetPassthrough`. Aucun décodage / ré-encodage —
    /// l'opération est limitée par la vitesse I/O disque (sub-seconde pour
    /// un clip mobile classique). Retourne `nil` si la passthrough n'est
    /// pas applicable, ce qui force le caller à fallback sur la pipeline
    /// AVAssetReader / Writer.
    ///
    /// Critères d'éligibilité :
    /// - Track vidéo en `kCMVideoCodecType_HEVC` ou `kCMVideoCodecType_H264`
    ///   (les codecs déjà efficaces, supportés universellement par les
    ///   players cibles : iOS, macOS, WhatsApp, Photos).
    /// - `naturalSize ≤ context.maxVideoResolution` (largeur ET hauteur).
    ///   Si l'asset est plus grand, il faut le rescaler → forcer le
    ///   re-encodage.
    /// - `estimatedDataRate ≤ context.videoBitRate × 2`. Tolérance 2× au
    ///   budget pour éviter de transcoder un clip à peine au-dessus — la
    ///   différence de taille (quelques MB) ne justifie pas 30 s+ de
    ///   compute thermal.
    ///
    /// Le caller utilise `try? await` car cette méthode peut throw sur
    /// asset corrompu — dans ce cas on retombe sur le path lent, qui
    /// fera la même check de track et throwra une erreur typée.
    private func passthroughIfPossible(
        asset: AVURLAsset,
        sourceURL: URL,
        outputURL: URL,
        context: MediaContext
    ) async throws -> URL? {
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            return nil
        }

        // Codec check via les format descriptions de la track.
        // Sous iOS 16+, le typed getter `.formatDescriptions` retourne
        // directement `[CMFormatDescription]` — pas besoin de downcast.
        let formats = try await videoTrack.load(.formatDescriptions)
        guard let firstFormat = formats.first else { return nil }
        let codec = CMFormatDescriptionGetMediaSubType(firstFormat)
        let isModernCodec = (codec == kCMVideoCodecType_HEVC) || (codec == kCMVideoCodecType_H264)
        guard isModernCodec else { return nil }

        // Résolution check — on compare la natural display size (après
        // rotation préférée) au budget. Si le source dépasse, on a besoin
        // de rescaler → on ne peut pas remux.
        let displaySize = try await videoTrack.naturalDisplaySize()
        let target = context.maxVideoResolution
        let fitsInBudget = displaySize.width <= target.width + 1 &&
                           displaySize.height <= target.height + 1
        guard fitsInBudget else { return nil }

        // Bitrate check — `estimatedDataRate` en bits/s. On tolère 2× le
        // budget : 4 Mbps story × 2 = 8 Mbps, ce qui couvre la majorité
        // des captures iPhone qui sortent autour de 10–15 Mbps mais
        // qu'on accepte au prix d'un fichier marginalement plus gros
        // plutôt qu'un re-encode de 30+ s.
        let estimatedBitrate = try await videoTrack.load(.estimatedDataRate)
        let bitrateBudget = Float(context.videoBitRate * 2)
        guard estimatedBitrate <= bitrateBudget else { return nil }

        // Tous les checks passent → remux via passthrough.
        guard let session = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetPassthrough
        ) else {
            return nil
        }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        await session.export()
        guard session.status == .completed else {
            // L'export passthrough a échoué pour une raison non-prévue
            // par les checks (asset corrompu, container exotique).
            // On signale au caller en throwant — il fera fallback sur
            // le path transcode lent (qui re-tentera le même asset).
            if let error = session.error {
                throw error
            }
            return nil
        }

        Self.logger.info("Video passthrough (no transcode): \(Int(displaySize.width))x\(Int(displaySize.height)) codec=\(codec == kCMVideoCodecType_HEVC ? "HEVC" : "H264", privacy: .public) @ ~\(Int(estimatedBitrate / 1000))kbps")
        return outputURL
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
