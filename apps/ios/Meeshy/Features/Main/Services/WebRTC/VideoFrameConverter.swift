//
//  VideoFrameConverter.swift
//  Meeshy
//
//  Lot 2 (PiP système) — convertit les frames vidéo décodées en `CMSampleBuffer`
//  prêts à enfiler sur une `AVSampleBufferDisplayLayer` (Picture-in-Picture
//  système). Le cœur (`CVPixelBuffer` → `CMSampleBuffer`) ne dépend PAS de WebRTC
//  et reste donc compilable + testable en mode stub (CI sans WebRTC). L'extraction
//  d'un `RTCVideoFrame` vit dans une extension `#if canImport(WebRTC)`.
//
//  Threading : `makeSampleBuffer` est appelé depuis la serial queue du
//  `PiPVideoRenderer` (thread de décodage WebRTC). La classe est `nonisolated`
//  + `@unchecked Sendable` (état mutable protégé par `lock`), à l'image de
//  `VideoFilterPipeline`.
//

import AVFoundation
import CoreVideo
import UIKit
import os

// MARK: - Protocol

/// Construit des `CMSampleBuffer` à partir de pixel buffers vidéo décodés, prêts
/// à être enfilés sur une `AVSampleBufferDisplayLayer`. La `CMVideoFormatDescription`
/// est cachée par (dimensions, pixelFormat) : elle n'est reconstruite qu'au
/// changement de palier de résolution (adaptation réseau WebRTC).
protocol VideoSampleBufferMaking: AnyObject {
    /// - Returns: un `CMSampleBuffer` marqué `DisplayImmediately` (frame live, pas
    ///   de timebase), ou `nil` si la création échoue (la frame est alors droppée
    ///   — jamais un crash).
    /// `nonisolated` : appelé depuis le thread de décodage WebRTC (le target est
    /// en `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor`, qui inférerait `@MainActor`).
    nonisolated func makeSampleBuffer(pixelBuffer: CVPixelBuffer, timeStampNs: Int64) -> CMSampleBuffer?
    nonisolated func reset()
}

// MARK: - Converter

nonisolated final class VideoFrameConverter: VideoSampleBufferMaking, @unchecked Sendable {

    private struct FormatKey: Hashable {
        let width: Int
        let height: Int
        let pixelFormat: OSType
    }

    private let lock = NSLock()
    private var formatCache: [FormatKey: CMVideoFormatDescription] = [:]

    // Pool de sortie NV12 pour la conversion I420 (chemin logiciel VP8/VP9).
    private var nv12Pool: CVPixelBufferPool?
    private var nv12PoolWidth = 0
    private var nv12PoolHeight = 0

    func makeSampleBuffer(pixelBuffer: CVPixelBuffer, timeStampNs: Int64) -> CMSampleBuffer? {
        guard let format = formatDescription(for: pixelBuffer) else { return nil }

        var timing = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: CMTime(value: timeStampNs, timescale: 1_000_000_000),
            decodeTimeStamp: .invalid
        )
        var sampleBuffer: CMSampleBuffer?
        let status = CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: format,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        )
        guard status == noErr, let sample = sampleBuffer else {
            Logger.pip.error("CMSampleBufferCreate failed status=\(status, privacy: .public)")
            return nil
        }
        markDisplayImmediately(sample)
        return sample
    }

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        formatCache.removeAll(keepingCapacity: true)
        nv12Pool = nil
        nv12PoolWidth = 0
        nv12PoolHeight = 0
    }

    /// Fond neutre + silhouette générique — remplace le flux live du PiP système
    /// quand le pair coupe sa caméra, pour ne jamais figer le dernier frame vidéo
    /// à l'écran (spec 2026-06-20 §5.3: "enqueue un buffer placeholder, pas le
    /// dernier frame figé"). Pur CoreGraphics/CoreVideo, aucune dépendance WebRTC.
    static func makePlaceholderPixelBuffer(width: Int = 480, height: Int = 854) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }

        context.setFillColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))

        let symbolConfig = UIImage.SymbolConfiguration(pointSize: CGFloat(min(width, height)) * 0.32, weight: .regular)
        if let symbolImage = UIImage(systemName: "person.crop.circle.fill", withConfiguration: symbolConfig)?
            .withTintColor(UIColor.white.withAlphaComponent(0.4), renderingMode: .alwaysOriginal),
           let cgSymbol = symbolImage.cgImage {
            let symbolSize = CGSize(width: cgSymbol.width, height: cgSymbol.height)
            let origin = CGPoint(x: (CGFloat(width) - symbolSize.width) / 2, y: (CGFloat(height) - symbolSize.height) / 2)
            context.draw(cgSymbol, in: CGRect(origin: origin, size: symbolSize))
        }
        return buffer
    }

    // MARK: - Format description cache

    private func formatDescription(for pixelBuffer: CVPixelBuffer) -> CMVideoFormatDescription? {
        let key = FormatKey(
            width: CVPixelBufferGetWidth(pixelBuffer),
            height: CVPixelBufferGetHeight(pixelBuffer),
            pixelFormat: CVPixelBufferGetPixelFormatType(pixelBuffer)
        )
        lock.lock()
        defer { lock.unlock() }
        if let cached = formatCache[key],
           CMVideoFormatDescriptionMatchesImageBuffer(cached, imageBuffer: pixelBuffer) {
            return cached
        }
        var description: CMVideoFormatDescription?
        let status = CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &description
        )
        guard status == noErr, let created = description else {
            Logger.pip.error("CMVideoFormatDescription create failed status=\(status, privacy: .public)")
            return nil
        }
        // Cardinal borné (paliers de résolution × formats discrets) — purge
        // défensive à 16 contre une source pathologique. On en voit rarement
        // plus de 5-6 paliers réseau : seuil à 8 provoquait du thrashing inutile.
        if formatCache.count > 16 { formatCache.removeAll(keepingCapacity: true) }
        formatCache[key] = created
        return created
    }

    /// Frames temps-réel : on demande au layer d'afficher immédiatement, sans
    /// attendre de timebase (pas de buffering ⇒ pas de fuite mémoire).
    private func markDisplayImmediately(_ sampleBuffer: CMSampleBuffer) {
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
              CFArrayGetCount(attachments) > 0 else { return }
        let raw = CFArrayGetValueAtIndex(attachments, 0)
        let dict = unsafeBitCast(raw, to: CFMutableDictionary.self)
        CFDictionarySetValue(
            dict,
            Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
            Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
        )
    }

    // MARK: - NV12 scratch pool (I420 fallback)

    fileprivate func dequeueNV12Buffer(width: Int, height: Int) -> CVPixelBuffer? {
        lock.lock()
        defer { lock.unlock() }
        if nv12Pool == nil || width != nv12PoolWidth || height != nv12PoolHeight {
            let bufferAttrs: [String: Any] = [
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
                kCVPixelBufferIOSurfacePropertiesKey as String: [:]
            ]
            let poolAttrs: [String: Any] = [kCVPixelBufferPoolMinimumBufferCountKey as String: 3]
            var pool: CVPixelBufferPool?
            let status = CVPixelBufferPoolCreate(kCFAllocatorDefault, poolAttrs as CFDictionary, bufferAttrs as CFDictionary, &pool)
            guard status == kCVReturnSuccess, let created = pool else {
                Logger.pip.warning("NV12 pool create failed status=\(status, privacy: .public)")
                return nil
            }
            nv12Pool = created
            nv12PoolWidth = width
            nv12PoolHeight = height
        }
        guard let pool = nv12Pool else { return nil }
        var buffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer) == kCVReturnSuccess else { return nil }
        return buffer
    }
}

// MARK: - Logger

private extension Logger {
    nonisolated static let pip = Logger(subsystem: "me.meeshy.app", category: "pip")
}

// MARK: - WebRTC bridging

#if canImport(WebRTC)
@preconcurrency import WebRTC

extension VideoFrameConverter {
    /// Extrait un `CVPixelBuffer` d'une frame distante décodée et l'emballe.
    /// Passthrough pour le chemin matériel (`RTCCVPixelBuffer`, H.264 — le codec
    /// épinglé, zéro copie) ; convertit `RTCI420Buffer` (VP8/VP9 logiciel) en NV12.
    /// Retourne `nil` pour un type de buffer inconnu (frame droppée — jamais un crash).
    nonisolated func makeSampleBuffer(from frame: RTCVideoFrame) -> CMSampleBuffer? {
        guard let pixelBuffer = pixelBuffer(from: frame.buffer) else { return nil }
        return makeSampleBuffer(pixelBuffer: pixelBuffer, timeStampNs: frame.timeStampNs)
    }

    private nonisolated func pixelBuffer(from buffer: RTCVideoFrameBuffer) -> CVPixelBuffer? {
        if let cv = buffer as? RTCCVPixelBuffer {
            return cv.pixelBuffer
        }
        return makeNV12PixelBuffer(from: buffer.toI420())
    }

    /// Convertit un buffer I420 planaire (Y + U + V) en `CVPixelBuffer` NV12
    /// (Y + CbCr entrelacé) via le pool de scratch. Gère les strides distincts.
    private nonisolated func makeNV12PixelBuffer(from i420: RTCI420BufferProtocol) -> CVPixelBuffer? {
        let width = Int(i420.width)
        let height = Int(i420.height)
        guard width > 0, height > 0 else { return nil }
        guard let pixelBuffer = dequeueNV12Buffer(width: width, height: height) else { return nil }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

        // Plan 0 — luminance (Y), copie ligne à ligne (strides distincts).
        if let dstY = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) {
            let dstStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
            let srcStride = Int(i420.strideY)
            let rowBytes = min(width, dstStride, srcStride)
            let srcY = i420.dataY
            for row in 0..<height {
                memcpy(dstY.advanced(by: row * dstStride), srcY.advanced(by: row * srcStride), rowBytes)
            }
        }

        // Plan 1 — chrominance entrelacée (CbCr) depuis les plans U et V séparés.
        let chromaWidth = Int(i420.chromaWidth)
        let chromaHeight = Int(i420.chromaHeight)
        if let dstC = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1) {
            let dstStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)
            // NV12 : le plan chroma entrelacé fait 2·chromaWidth octets par ligne.
            // Garde défensive contre un stride insuffisant (sinon débordement
            // d'écriture sur `dstRow[2*column+1]`).
            guard dstStride >= chromaWidth * 2 else { return nil }
            let dst = dstC.bindMemory(to: UInt8.self, capacity: dstStride * chromaHeight)
            let srcU = i420.dataU
            let srcV = i420.dataV
            let srcStrideU = Int(i420.strideU)
            let srcStrideV = Int(i420.strideV)
            // Mirror the Y-plane's defensive clamp above: a source chroma
            // stride narrower than the chroma width would walk `uRow`/`vRow`
            // past the end of `dataU`/`dataV` on the last column read below.
            guard srcStrideU >= chromaWidth, srcStrideV >= chromaWidth else { return nil }
            for row in 0..<chromaHeight {
                let dstRow = dst.advanced(by: row * dstStride)
                let uRow = srcU.advanced(by: row * srcStrideU)
                let vRow = srcV.advanced(by: row * srcStrideV)
                for column in 0..<chromaWidth {
                    dstRow[2 * column] = uRow[column]
                    dstRow[2 * column + 1] = vRow[column]
                }
            }
        }
        return pixelBuffer
    }
}
#endif
