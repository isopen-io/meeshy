import XCTest
import AVFoundation
import CoreMedia
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #18555 — de bout en bout : le MP4 sorti du moteur porte le son d'une vidéo
/// posée (et ne le porte plus quand elle est coupée), et la transition de
/// sortie que le player joue (`StoryRenderer.applyClosing`).
final class StoryExportSceneParityEndToEndTests: XCTestCase {

    @MainActor
    func test_export_foregroundVideoWithSound_bakesAnAudioTrack() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil)
        let output = try await exportOverlay(volume: 1)
        defer { try? FileManager.default.removeItem(at: output) }

        let audio = try await AVURLAsset(url: output).loadTracks(withMediaType: .audio)
        XCTAssertEqual(audio.count, 1, "le son de la vidéo posée part dans le fichier")
    }

    @MainActor
    func test_export_mutedForegroundVideo_bakesNoAudioTrack() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil)
        let output = try await exportOverlay(volume: 0)
        defer { try? FileManager.default.removeItem(at: output) }

        let audio = try await AVURLAsset(url: output).loadTracks(withMediaType: .audio)
        XCTAssertTrue(audio.isEmpty, "une vidéo posée coupée reste muette dans le fichier")
    }

    @MainActor
    func test_export_closingFade_fadesTheSceneOutAtTheEnd() async throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil)
        let image = Self.temporary("png")
        let overlay = Self.temporary("mp4")
        let output = Self.temporary("mp4")
        defer { [image, overlay, output].forEach { try? FileManager.default.removeItem(at: $0) } }
        try BackgroundVideoFixture.makeSolidImage(color: .blue, size: CGSize(width: 1080, height: 1920), at: image)
        try await BackgroundVideoFixture.makeVideo(duration: 3, size: CGSize(width: 480, height: 480),
                                                   at: overlay, fill: (b: 0, g: 255, r: 0, a: 255))
        var closing = BackgroundVideoFixture.imageBackgroundVideoOverlaySlide(
            imageURL: image, overlayVideoURL: overlay, overlayDurationSec: 3, slideDuration: 3)
        closing.effects.closing = .fade
        let slide = closing

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: output)
        }.value

        let before = try await ExportPixelProbe.color(ofMP4: output, atSeconds: 0.5, nx: 0.5, ny: 0.5)
        let end = try await ExportPixelProbe.color(ofMP4: output, atSeconds: 2.95, nx: 0.5, ny: 0.5)
        XCTAssertGreaterThan(before.g, 150, "avant la sortie, la vidéo posée se voit")
        XCTAssertGreaterThan(end.b, end.g, "en fin de sortie, la scène s'est effacée sur le fond")
    }

    // MARK: - Fabriques

    @MainActor
    private func exportOverlay(volume: Float) async throws -> URL {
        let sound = try SceneSoundFixture.tone(seconds: 2, aac: true)
        defer { try? FileManager.default.removeItem(at: sound) }
        let media = SceneSoundFixture.video(url: sound, volume: volume, duration: 2)
        let slide = SceneSoundFixture.slide(medias: [media], duration: 2)
        let output = Self.temporary("mp4")
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: output)
        }.value
        return output
    }

    private static func temporary(_ ext: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("scene-parity-\(UUID().uuidString).\(ext)")
    }
}

@MainActor
final class StoryAVCompositorClosingParityTests: XCTestCase {

    private let total: Double = 10

    func test_applyStaticClosing_midWindow_matchesThePlayerCurve() {
        let layer = CALayer()
        let elapsed = total - StoryRenderer.slideTransitionDuration / 2

        StoryAVCompositor.applyStaticClosing(.fade, rootLayer: layer, elapsed: elapsed, totalDuration: total)

        XCTAssertEqual(layer.opacity, 0.5, accuracy: 0.001)
    }

    func test_applyStaticClosing_beforeItsWindow_leavesTheOpeningUntouched() {
        let layer = CALayer()
        layer.opacity = 0.3

        StoryAVCompositor.applyStaticClosing(.fade, rootLayer: layer, elapsed: 0.2, totalDuration: total)

        XCTAssertEqual(layer.opacity, 0.3, accuracy: 0.001)
    }
}
