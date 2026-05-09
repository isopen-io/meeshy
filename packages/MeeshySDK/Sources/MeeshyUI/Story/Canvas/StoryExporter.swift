import AVFoundation
import CoreMedia
import Foundation
import MeeshySDK

public enum StoryExporterError: Error, Sendable {
    case noBackgroundVideo
    case invalidMediaURL
    case backgroundAssetVideoTrackMissing
    case sessionCreationFailed
    case exportFailed(String)
    case exportCancelled
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
/// Phase 4 scope:
///   The current implementation requires the slide to expose a background looping
///   video media object (`mediaObjects.first(where: { $0.isBackground && $0.loop })`)
///   so `AVMutableComposition` has a track to drive frame timing. Static slides
///   without a background video throw `StoryExporterError.noBackgroundVideo` —
///   handling that case (synthetic blank track) is a Phase 5 follow-up.
public enum StoryExporter {

    public static func export(_ slide: StorySlide,
                              to outputURL: URL) async throws {
        guard let bg = (slide.effects.mediaObjects ?? [])
            .first(where: { $0.isBackground && $0.loop }) else {
            throw StoryExporterError.noBackgroundVideo
        }
        guard let urlString = bg.mediaURL,
              let bgURL = URL(string: urlString) else {
            throw StoryExporterError.invalidMediaURL
        }

        let composition = AVMutableComposition()
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
        let effective = slide.effectiveSlideDuration()
        let totalDuration = CMTime(seconds: effective, preferredTimescale: 600)

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
}
