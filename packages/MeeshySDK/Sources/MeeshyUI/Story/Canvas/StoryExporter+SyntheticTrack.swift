import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import MeeshySDK
import UIKit

/// Le substrat vidéo synthétique des slides sans fond vidéo — extrait tel quel
/// de `StoryExporter.swift`, qui dépassait le plafond de 1200 lignes (#8599).
extension StoryExporter {

    // MARK: - Synthetic video track (static-only slides)

    /// Inserts a synthetic transparent video track into `composition` covering
    /// `duration`. No-op if the composition already has any `.video` track.
    ///
    /// The synthetic asset is a 1-sec BGRA 0x00000000 movie cached in
    /// `CacheCoordinator.video` keyed by render size, then `insertTimeRange`
    /// looped repeatedly to cover the slide's full effective duration. The
    /// pixel content is irrelevant because `StoryAVCompositor.startRequest`
    /// overwrites every pixel of every frame via `layerTree.render(in:)`.
    static func ensureVideoTrack(in composition: AVMutableComposition,
                                 at startTime: CMTime = .zero,
                                 duration: CMTime,
                                 size: CGSize) async throws {
        if !composition.tracks(withMediaType: .video).isEmpty { return }

        let syntheticURL = try await syntheticTransparentAsset(size: size)
        let asset = AVURLAsset(url: syntheticURL)
        guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Generated synthetic asset has no video track"
            )
        }
        let assetDuration = try await asset.load(.duration)
        // Defensive: if the asset somehow ended up empty, we can't loop into it.
        guard assetDuration > .zero else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Synthetic asset has zero duration"
            )
        }

        guard let videoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw StoryExporterError.sessionCreationFailed
        }

        // Loop the short (1 s) substrate until we reach `duration`. Each chunk
        // is clipped to the remaining tail so the composition lands exactly on
        // `duration` — no partial frames past the requested length.
        var inserted = CMTime.zero
        while inserted < duration {
            let remaining = duration - inserted
            let chunkDuration = CMTimeMinimum(assetDuration, remaining)
            try videoTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: chunkDuration),
                of: assetVideoTrack,
                at: startTime + inserted
            )
            inserted = inserted + chunkDuration
        }
    }

    /// Appends repetitions of the cached transparent substrate to an EXISTING
    /// video track, starting at `startTime` and covering `duration`. Used to
    /// pad the tail of a non-looped background video clip that ends before the
    /// slide's effective duration. Mirrors `ensureVideoTrack`'s loop logic but
    /// operates on a caller-owned track so we don't add a second track to the
    /// composition (AVAssetExportSession + custom compositor expects exactly
    /// one video track in this pipeline).
    static func appendTransparentTail(to videoTrack: AVMutableCompositionTrack,
                                      at startTime: CMTime,
                                      duration: CMTime,
                                      size: CGSize) async throws {
        guard duration > .zero else { return }

        let syntheticURL = try await syntheticTransparentAsset(size: size)
        let asset = AVURLAsset(url: syntheticURL)
        guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Generated synthetic asset has no video track"
            )
        }
        let assetDuration = try await asset.load(.duration)
        guard assetDuration > .zero else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Synthetic asset has zero duration"
            )
        }

        var inserted = CMTime.zero
        while inserted < duration {
            let remaining = duration - inserted
            let chunkDuration = CMTimeMinimum(assetDuration, remaining)
            try videoTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: chunkDuration),
                of: assetVideoTrack,
                at: startTime + inserted
            )
            inserted = inserted + chunkDuration
        }
    }

    /// Returns a file URL to a 1-sec transparent BGRA `.mov` asset of the given
    /// size, generating and caching it on first call. Cache key is the integer
    /// size in pixels so different render sizes coexist.
    ///
    /// The synthetic asset lives in `CacheCoordinator.video`; subsequent calls
    /// return the cached file without re-generating.
    static func syntheticTransparentAsset(size: CGSize) async throws -> URL {
        let cacheKey = "synthetic-transparent-\(Int(size.width))x\(Int(size.height)).mov"

        // Fast path: synchronous nonisolated lookup via CacheCoordinator's
        // static helper (no actor hop). Returns the file URL if present on
        // disk. We can't dot into `shared.video.cachedFileURL` directly from
        // outside the actor — the `.video` property access is isolated.
        if let cached = CacheCoordinator.videoLocalFileURL(for: cacheKey) {
            return cached
        }

        // Cold path: generate the asset off the main actor (AVAssetWriter is
        // synchronous-blocking; we don't want to stall the calling actor while
        // it grinds through ~30 BGRA frames + finishWriting()).
        let generatedURL = try await Task.detached(priority: .userInitiated) {
            try await Self.generateTransparentMov(size: size, duration: 1.0)
        }.value

        // Move the generated file into the cache's address space. We read the
        // bytes back and call `save(_:for:)` so the cache owns the file at the
        // path `cachedFileURL(for:)` resolves to. Then delete the temp source.
        let data: Data
        do {
            data = try Data(contentsOf: generatedURL)
        } catch {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Failed to read generated synthetic asset: \(error.localizedDescription)"
            )
        }
        // `save` is async on the actor; the await covers both the property
        // access (`.video`) and the actor-isolated method call.
        await CacheCoordinator.shared.video.save(data, for: cacheKey)
        try? FileManager.default.removeItem(at: generatedURL)

        guard let cached = CacheCoordinator.videoLocalFileURL(for: cacheKey) else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Synthetic asset was generated but cache lookup failed"
            )
        }
        return cached
    }

    /// Generates a single-track BGRA `.mov` of the given size and duration,
    /// every pixel 0x00000000. Used as a substrate for static-only slide
    /// exports — the compositor overwrites every pixel each frame so the
    /// transparent content is never visible.
    ///
    /// Concurrency: this method is `nonisolated` and performs synchronous
    /// AVAssetWriter calls. It MUST be invoked from a `Task.detached` (off
    /// the main actor) so the writer's internal queues don't contend with UI
    /// work. The Swift 6 isolation checker enforces this.
    nonisolated private static func generateTransparentMov(size: CGSize,
                                                           duration: TimeInterval) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-synthetic-transparent-\(UUID().uuidString).mov")
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }

        // Track success so the temp file is cleaned up on any failure path.
        // Caller (syntheticTransparentAsset) reads the bytes into Data and
        // pipes them to CacheCoordinator.video.save — the temp source is
        // already cleaned up there on success. The defer here covers the
        // mid-generation throw paths so we don't leak orphan .mov files in
        // /tmp on repeated failures.
        var generationSucceeded = false
        defer {
            if !generationSucceeded {
                try? FileManager.default.removeItem(at: url)
            }
        }

        let writer: AVAssetWriter
        do {
            writer = try AVAssetWriter(url: url, fileType: .mov)
        } catch {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "AVAssetWriter init failed: \(error.localizedDescription)"
            )
        }

        // H.264 does NOT preserve alpha — the BGRA 0x00000000 frame below
        // encodes as opaque black, not transparent. This is intentional and
        // safe : StoryAVCompositor.startRequest overwrites every pixel via
        // `layer.render(in:)` so the substrate's color is never visible. If
        // a future caller blends WITH the substrate (e.g. alpha punch-through
        // crossfade), switch to AVVideoCodecType.proRes4444 in .mov to get
        // real transparency at the cost of larger files.
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height)
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        input.expectsMediaDataInRealTime = false

        let bufferAttributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height)
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: bufferAttributes
        )

        guard writer.canAdd(input) else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Cannot add writer input"
            )
        }
        writer.add(input)

        guard writer.startWriting() else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                writer.error?.localizedDescription ?? "startWriting failed"
            )
        }
        writer.startSession(atSourceTime: .zero)

        let fps: Int32 = 30
        let totalFrames = max(1, Int(duration * Double(fps)))

        for i in 0..<totalFrames {
            // Spin briefly until the input accepts the next frame. AVAssetWriter
            // throttles based on its internal buffer state; sleeping 1 ms keeps
            // CPU low while staying responsive.
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            guard let pool = adaptor.pixelBufferPool else {
                throw StoryExporterError.syntheticAssetGenerationFailed(
                    "No pixel buffer pool"
                )
            }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
            guard let pixelBuffer = pb else {
                throw StoryExporterError.syntheticAssetGenerationFailed(
                    "Pixel buffer alloc failed"
                )
            }
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            if let base = CVPixelBufferGetBaseAddress(pixelBuffer) {
                let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
                let height = CVPixelBufferGetHeight(pixelBuffer)
                // Zero the buffer (BGRA 0x00000000). Note: H.264 discards
                // alpha so this encodes as opaque black, NOT transparent —
                // see top-of-function note. Zeroing prevents undefined memory
                // from bleeding into the encoded MP4.
                memset(base, 0, bytesPerRow * height)
            }
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

            let presentationTime = CMTime(value: CMTimeValue(i), timescale: fps)
            adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
        }

        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                writer.error?.localizedDescription ?? "Writer did not complete"
            )
        }
        generationSucceeded = true
        return url
    }
}
