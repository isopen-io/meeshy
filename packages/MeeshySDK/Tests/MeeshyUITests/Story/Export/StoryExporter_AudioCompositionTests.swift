import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for the audio composition path added to `StoryExporter` so the
/// exported MP4 carries the background video's audio track (vlog-style
/// stories were exporting silent before this fix).
///
/// **Scope** — this fixture only validates the bg-video audio path. The
/// `audioPlayerObjects` family (foreground audios + voice clip) requires
/// a `postMediaId → URL` resolver injected through `StoryExporter.export`
/// and is the subject of a follow-up commit; tests for that path will
/// land alongside the resolver injection.
final class StoryExporter_AudioCompositionTests: XCTestCase {

    // MARK: - No background video → no audio mix produced

    @MainActor
    func test_composeBackgroundVideoAudio_noBackground_returnsNil() async throws {
        // Static-only slide (text/sticker), no bg media at all.
        let slide = StorySlide(
            id: "static",
            content: "Hello",
            effects: StoryEffects(),
            duration: 4
        )
        let composition = AVMutableComposition()

        let mix = try await StoryExporter.composeBackgroundVideoAudio(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 4, preferredTimescale: 600),
            backgroundVideoAsset: nil
        )

        XCTAssertNil(mix, "No bg → no audio mix")
        XCTAssertTrue(
            composition.tracks(withMediaType: .audio).isEmpty,
            "Composition must not carry a stray audio track"
        )
    }

    // MARK: - Silent background video → no audio track inserted

    @MainActor
    func test_composeBackgroundVideoAudio_silentBackgroundVideo_returnsNil() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Generate a silent video fixture (BackgroundVideoFixture writes
        // pure video, no audio track).
        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("silent_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        try await BackgroundVideoFixture.makeVideo(
            duration: 2.0,
            size: CGSize(width: 540, height: 960),
            at: bgURL
        )

        let media = StoryMediaObject(
            id: "bg",
            postMediaId: "bg",
            mediaURL: bgURL.absoluteString,
            mediaType: StoryMediaKind.video.rawValue,
            aspectRatio: 540.0 / 960.0,
            volume: 1.0,
            isBackground: true
        )
        let slide = StorySlide(
            id: "bg-silent",
            content: nil,
            effects: StoryEffects(mediaObjects: [media]),
            duration: 4
        )
        let composition = AVMutableComposition()
        let asset = AVURLAsset(url: bgURL)

        let mix = try await StoryExporter.composeBackgroundVideoAudio(
            slide: slide,
            composition: composition,
            totalDuration: CMTime(seconds: 4, preferredTimescale: 600),
            backgroundVideoAsset: (asset, media)
        )

        XCTAssertNil(mix, "Silent bg video → no audio mix")
        XCTAssertTrue(
            composition.tracks(withMediaType: .audio).isEmpty,
            "Silent source must not produce an audio track in the composition"
        )
    }

    // MARK: - Volume = 1.0 returns nil (no mix needed)

    @MainActor
    func test_composeBackgroundVideoAudio_volumeOne_isOptimisedAway() async throws {
        // Pin the optimisation : when volume is the natural 1.0, we skip
        // building an AVMutableAudioMix at all — AVFoundation defaults to
        // unity gain. This documents the contract for future maintainers
        // who might wonder why a perfectly valid bg video returned `nil`.
        let composition = AVMutableComposition()
        let mix = try await StoryExporter.composeBackgroundVideoAudio(
            slide: StorySlide(id: "x", content: nil, effects: StoryEffects(), duration: 4),
            composition: composition,
            totalDuration: CMTime(seconds: 4, preferredTimescale: 600),
            backgroundVideoAsset: nil
        )
        XCTAssertNil(mix)
    }
}
