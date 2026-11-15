import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// #7878 — pendant un parcours au doigt, la vidéo de FOND suit le doigt.
///
/// Retour porteur au test réel : « le défilement ne fait pas reculer la vidéo
/// du réel, ça ne change absolument rien ». La cause : un fond qui BOUCLE
/// (`AVPlayerLooper`) n'était jamais recalé — la preview du composer le laisse
/// tourner, et le scrub du lecteur en avait hérité. Ces témoins mesurent le
/// `currentTime()` du player RÉELLEMENT monté, pas une valeur calculée.
@MainActor
final class StoryBackgroundLoopScrubTests: XCTestCase {

    // MARK: - Temps média = f(temps scène) pour un fond bouclé

    func test_loopedScrubTarget_withinTheFirstLap_isThePlayhead() {
        XCTAssertEqual(StoryBackgroundLayer.loopedScrubTarget(playhead: 2.5, itemDuration: 4) ?? -1, 2.5, accuracy: 0.0001)
    }

    func test_loopedScrubTarget_afterSeveralLaps_isThePhaseInTheCurrentLap() {
        XCTAssertEqual(StoryBackgroundLayer.loopedScrubTarget(playhead: 9, itemDuration: 4) ?? -1, 1, accuracy: 0.0001)
    }

    func test_loopedScrubTarget_unknownDuration_isNil() {
        XCTAssertNil(StoryBackgroundLayer.loopedScrubTarget(playhead: 3, itemDuration: .nan))
        XCTAssertNil(StoryBackgroundLayer.loopedScrubTarget(playhead: 3, itemDuration: 0))
        XCTAssertNil(StoryBackgroundLayer.loopedScrubTarget(playhead: .infinity, itemDuration: 4))
    }

    func test_loopedScrubTarget_negativePlayhead_isTheStart() {
        XCTAssertEqual(StoryBackgroundLayer.loopedScrubTarget(playhead: -1, itemDuration: 4) ?? -1, 0, accuracy: 0.0001)
    }

    // MARK: - Le player MONTÉ est bien déplacé

    private func video(seconds: TimeInterval) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("scrub-bg-\(UUID().uuidString).mp4")
        try await BackgroundVideoFixture.makeVideo(duration: seconds, size: CGSize(width: 64, height: 64), at: url)
        return url
    }

    private func waitUntilReady(_ player: AVPlayer?) async throws {
        for _ in 0..<100 {
            if player?.currentItem?.status == .readyToPlay,
               (player?.currentItem?.duration.seconds ?? 0) > 0 { return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Fixture : l'item vidéo n'est jamais devenu prêt")
    }

    private func settledTime(of player: AVPlayer?, near target: Double) async throws -> Double {
        for _ in 0..<60 {
            let now = player?.currentTime().seconds ?? -1
            if abs(now - target) < 0.2 { return now }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        return player?.currentTime().seconds ?? -1
    }

    func test_scrub_loopedBackground_seeksTheMountedPlayerIntoTheCurrentLap() async throws {
        let layer = StoryBackgroundLayer()
        layer.attachBackgroundPlayer(url: try await video(seconds: 4), looping: true, mute: true)
        try await waitUntilReady(layer.avPlayer)

        layer.slidePlayheadSeconds = 5
        layer.alignPausedForReaderScrub()

        let measured = try await settledTime(of: layer.avPlayer, near: 1)
        XCTAssertEqual(measured, 1, accuracy: 0.2,
                       "Scène à 5 s sur un fond bouclé de 4 s : l'image affichée est celle de 1 s du 2e tour")
        XCTAssertEqual(layer.avPlayer?.rate ?? -1, 0, "Pendant le glissé, le fond est en pause")
    }

    func test_scrub_nonLoopedBackground_seeksTheMountedPlayerToThePlayhead() async throws {
        let layer = StoryBackgroundLayer()
        layer.attachBackgroundPlayer(url: try await video(seconds: 4), looping: false, mute: true)
        try await waitUntilReady(layer.avPlayer)

        layer.slidePlayheadSeconds = 2.5
        layer.alignPausedForReaderScrub()

        let measured = try await settledTime(of: layer.avPlayer, near: 2.5)
        XCTAssertEqual(measured, 2.5, accuracy: 0.2)
    }
}
