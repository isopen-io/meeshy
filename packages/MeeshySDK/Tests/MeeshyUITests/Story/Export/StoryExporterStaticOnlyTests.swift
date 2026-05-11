import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for the Phase 4 follow-up (B1): static-only slide export.
///
/// A slide that has only `textObjects` / `stickerObjects` / `drawingData` and
/// no background looping video used to throw `StoryExporterError.noBackgroundVideo`.
/// `StoryExporter` now synthesises a transparent BGRA video track via
/// `ensureVideoTrack(in:duration:size:)` so the compositor has a substrate to
/// draw on. These tests pin that contract.
///
/// All export-pipeline tests honour `MEESHY_SKIP_EXPORT_TESTS` so CI can skip
/// the slow paths when Metal / AVFoundation aren't reliable.
final class StoryExporterStaticOnlyTests: XCTestCase {

    // MARK: - End-to-end pipeline

    @MainActor
    func test_export_slideStaticOnly_producesVideoFile() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_static_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = StaticOnlyFixture.makeSlide(staticBaseDuration: 2.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path),
                      "Export should produce a file at the output URL")
        let attrs = try FileManager.default.attributesOfItem(atPath: outputURL.path)
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        XCTAssertGreaterThan(size, 1024, "Export MP4 should be at least 1 KB (got \(size) bytes)")
    }

    @MainActor
    func test_export_slideStaticOnly_videoFileHasFrames() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_static_frames_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let staticBaseDuration: TimeInterval = 2.0
        let slide = StaticOnlyFixture.makeSlide(staticBaseDuration: staticBaseDuration)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // The exported file must contain a real video track, not just an empty
        // container or audio-only stream.
        let asset = AVURLAsset(url: outputURL)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let track = try XCTUnwrap(videoTracks.first, "Export should contain a video track")

        // Render size respects designSize (compositor renderSize).
        let naturalSize = try await track.load(.naturalSize)
        XCTAssertEqual(naturalSize.width, CanvasGeometry.designSize.width, accuracy: 1.0,
                       "Static-only export should render at designSize.width (1080)")
        XCTAssertEqual(naturalSize.height, CanvasGeometry.designSize.height, accuracy: 1.0,
                       "Static-only export should render at designSize.height (1920)")

        // Duration matches the slide's effective duration. Static-only slides
        // have no background loop, so effectiveSlideDuration() == slide.duration.
        let exportDuration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), staticBaseDuration, accuracy: 0.15,
                       "Static-only export duration should match slide.duration")

        // The track must contain at least *some* decodable frames. We probe via
        // AVAssetImageGenerator at the midpoint — if synthesis failed silently
        // and produced an empty track, this would return nil.
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let midpoint = CMTime(seconds: staticBaseDuration / 2, preferredTimescale: 600)
        let (image, _) = try await generator.image(at: midpoint)
        XCTAssertGreaterThan(image.width, 0,
                             "Should be able to extract a non-empty frame at midpoint")
        XCTAssertGreaterThan(image.height, 0,
                             "Should be able to extract a non-empty frame at midpoint")
    }

    @MainActor
    func test_export_slideStaticOnly_frameMatchesLiveView() async throws {
        // Pixel-exact comparison between the live StoryRenderer output and the
        // AVFoundation-encoded export is unreachable today: H.264 is lossy,
        // AVAssetImageGenerator applies chroma resampling, and Display P3 ↔ sRGB
        // round-trips with sub-LSB drift. This scaffold is reactivated in B2
        // (SSIM tolerance metric ≥ 0.99) — see
        // docs/superpowers/specs/2026-05-09-story-canvas-phase4-followups-design.md
        // §3.2.
        try XCTSkipIf(true, """
            Skipped pending B2 (SSIM ≥ 0.99 tolerance) — pixel-exact equality
            between live preview and lossy H.264 export is structurally
            unreachable. Scaffold preserved for re-activation in B2.
            """)

        // ---- Scaffold for B2 ----
        // let outputURL = FileManager.default.temporaryDirectory
        //     .appendingPathComponent("export_static_match_\(UUID().uuidString).mp4")
        // defer { try? FileManager.default.removeItem(at: outputURL) }
        //
        // let slide = StaticOnlyFixture.makeSlide(staticBaseDuration: 2.0)
        //
        // // Live render at t=0.
        // let geometry = CanvasGeometry(renderSize: CanvasGeometry.designSize)
        // let liveLayer = StoryRenderer.render(slide: slide,
        //                                       into: geometry,
        //                                       at: .zero,
        //                                       mode: .play)
        // let liveImage = renderLayerToCGImage(liveLayer, size: geometry.renderSize)
        //
        // try await Task.detached(priority: .userInitiated) {
        //     try await StoryExporter.export(slide, to: outputURL)
        // }.value
        //
        // let asset = AVURLAsset(url: outputURL)
        // let generator = AVAssetImageGenerator(asset: asset)
        // generator.appliesPreferredTrackTransform = true
        // let (exportFrame, _) = try await generator.image(at: .zero)
        //
        // let metric = PixelComparison.ssim(liveImage, exportFrame)
        // XCTAssertGreaterThan(metric, 0.99)
    }

    // MARK: - Synthetic asset cache contract

    func test_syntheticTransparentAsset_cached() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Use a one-off size so a parallel test run can't reuse a pre-existing
        // cache entry. The first call must generate from scratch, the second
        // must return the cached URL — proven by identical modification dates.
        let probeSize = CGSize(width: 320, height: 568)

        let urlFirst = try await StoryExporter.syntheticTransparentAsset(size: probeSize)
        XCTAssertTrue(FileManager.default.fileExists(atPath: urlFirst.path),
                      "First call should produce a real file on disk")
        let attrsFirst = try FileManager.default.attributesOfItem(atPath: urlFirst.path)
        let modDateFirst = attrsFirst[.modificationDate] as? Date

        let urlSecond = try await StoryExporter.syntheticTransparentAsset(size: probeSize)
        XCTAssertEqual(urlFirst.path, urlSecond.path,
                       "Second call must return the same cached URL (deterministic key)")
        let attrsSecond = try FileManager.default.attributesOfItem(atPath: urlSecond.path)
        let modDateSecond = attrsSecond[.modificationDate] as? Date

        // If the second call re-generated the file, modDate would shift. We
        // accept equality (cache hit, no rewrite) — anything else means the
        // cache was bypassed.
        XCTAssertEqual(modDateFirst, modDateSecond,
                       "Cache hit must NOT rewrite the file (mtime should be unchanged)")
    }

    func test_syntheticTransparentAsset_correctSize() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Use designSize so the generated asset is the one the real export
        // pipeline would consume. Cache hit acceptable — we're testing the
        // asset's dimensions, not its generation freshness.
        let size = CanvasGeometry.designSize
        let url = try await StoryExporter.syntheticTransparentAsset(size: size)

        let asset = AVURLAsset(url: url)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let track = try XCTUnwrap(videoTracks.first,
                                   "Generated synthetic asset must have a video track")
        let naturalSize = try await track.load(.naturalSize)
        XCTAssertEqual(naturalSize.width, size.width, accuracy: 1.0,
                       "Synthetic asset width should match requested size")
        XCTAssertEqual(naturalSize.height, size.height, accuracy: 1.0,
                       "Synthetic asset height should match requested size")
    }
}

// MARK: - Fixture helpers

private enum StaticOnlyFixture {
    /// Builds a `StorySlide` with one text object and zero media objects — the
    /// exact configuration that previously threw `noBackgroundVideo`. After
    /// B1, this must export end-to-end via the synthetic substrate.
    static func makeSlide(staticBaseDuration: TimeInterval) -> StorySlide {
        let text = StoryTextObject(
            id: UUID().uuidString,
            text: "Static only",
            x: 0.5, y: 0.5,
            fontSize: 64.0,
            startTime: 0.0,
            duration: staticBaseDuration
        )
        var effects = StoryEffects()
        effects.textObjects = [text]
        // Intentionally no mediaObjects — that's the whole point of the test.

        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: staticBaseDuration,
                          order: 0)
    }
}
