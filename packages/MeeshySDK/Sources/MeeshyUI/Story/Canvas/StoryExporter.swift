import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import MeeshySDK

public enum StoryExporterError: Error, Sendable {
    case noBackgroundVideo
    case invalidMediaURL
    case backgroundAssetVideoTrackMissing
    case sessionCreationFailed
    case exportFailed(String)
    case exportCancelled
    /// Raised when the synthetic transparent video track required to drive the
    /// compositor for a static-only slide (text/sticker/drawing without media
    /// video) cannot be generated. This is a hard failure mode — the export
    /// pipeline has no substrate to draw on.
    case syntheticAssetGenerationFailed(String)
}

/// Exports a single `StorySlide` to an MP4 file by driving an `AVMutableComposition`
/// through `StoryAVCompositor` — which produces every export frame using the same
/// `StoryRenderer.render()` consumed by the live composer/viewer canvas.
///
/// Concurrency contract:
///   `export()` MUST NOT be called from `MainActor` synchronously (e.g. via
///   `DispatchQueue.main.sync`). The custom compositor bridges back to main for
///   each frame; if the caller blocks main waiting on `export()`, that bridge
///   deadlocks. Always invoke from a `Task` or a non-main async context.
///
/// Static-only slides:
///   When the slide has no background looping video (text/sticker/drawing only),
///   a synthetic 1-sec transparent BGRA asset is generated on the fly and
///   inserted as repeated time ranges to cover the slide duration. The
///   compositor's `startRequest(_:)` overwrites every pixel via
///   `layerTree.render(in: context)` each frame, so the synthetic substrate is
///   never visible — only its presence as a video track matters (AVFoundation
///   needs at least one video track to invoke a custom compositor).
public enum StoryExporter {

    public static func export(_ slide: StorySlide,
                              to outputURL: URL) async throws {
        let composition = AVMutableComposition()
        let effective = slide.effectiveSlideDuration()
        let totalDuration = CMTime(seconds: effective, preferredTimescale: 600)

        // 1. If the slide has a background looping video, drive the composition
        //    timing from it. Otherwise, fall through to `ensureVideoTrack` which
        //    synthesises a transparent track for static-only slides.
        if let bg = (slide.effects.mediaObjects ?? [])
            .first(where: { $0.isBackground && $0.loop }) {
            guard let urlString = bg.mediaURL,
                  let bgURL = URL(string: urlString) else {
                throw StoryExporterError.invalidMediaURL
            }
            guard let videoTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                throw StoryExporterError.sessionCreationFailed
            }

            let asset = AVURLAsset(url: bgURL)
            guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
                throw StoryExporterError.backgroundAssetVideoTrackMissing
            }
            let assetDuration = try await asset.load(.duration)

            // Loop background video to cover effectiveSlideDuration() (Section 3.6
            // of the spec: ensures the slide ends on a full repetition).
            var inserted = CMTime.zero
            while inserted < totalDuration {
                let remaining = totalDuration - inserted
                let chunkDuration = CMTimeMinimum(assetDuration, remaining)
                try videoTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: chunkDuration),
                    of: assetVideoTrack,
                    at: inserted
                )
                inserted = inserted + chunkDuration
            }
        } else {
            // 2. Static-only slide — synthesise a transparent video substrate.
            try await ensureVideoTrack(in: composition,
                                       duration: totalDuration,
                                       size: CanvasGeometry.designSize)
        }

        let videoComposition = AVMutableVideoComposition()
        videoComposition.frameDuration = CMTime(value: 1, timescale: 60) // 60 fps master
        videoComposition.renderSize = CanvasGeometry.designSize           // 1080×1920
        videoComposition.customVideoCompositorClass = StoryAVCompositor.self
        videoComposition.instructions = [
            StoryCompositionInstruction(
                slide: slide,
                timeRange: CMTimeRange(start: .zero, duration: totalDuration)
            )
        ]

        guard let session = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw StoryExporterError.sessionCreationFailed
        }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.shouldOptimizeForNetworkUse = true

        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }

        // iOS 17 ships `AVAssetExportSession.export()` (no args, async, reads
        // outputURL/outputFileType set above). The newer iOS 18 `export(to:as:)`
        // is intentionally avoided here — Package.swift targets iOS 17.
        await session.export()
        switch session.status {
        case .completed:
            return
        case .failed:
            throw StoryExporterError.exportFailed(
                session.error?.localizedDescription ?? "unknown"
            )
        case .cancelled:
            throw StoryExporterError.exportCancelled
        default:
            throw StoryExporterError.exportFailed(
                "Unexpected status \(session.status.rawValue)"
            )
        }
    }

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
                at: inserted
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

        let writer: AVAssetWriter
        do {
            writer = try AVAssetWriter(url: url, fileType: .mov)
        } catch {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "AVAssetWriter init failed: \(error.localizedDescription)"
            )
        }

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
                // 0x00000000 = fully transparent BGRA. The compositor will
                // overwrite every byte of every frame, so the substrate's
                // colour is never seen — but we zero it anyway so undefined
                // memory can never bleed into the encoded MP4.
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
        return url
    }
}
