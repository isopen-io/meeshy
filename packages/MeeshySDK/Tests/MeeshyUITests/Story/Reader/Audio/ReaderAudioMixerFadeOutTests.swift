import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#9867 — la story qu'on ferme s'éteint en fondu.**
///
/// Le lecteur postait `.storyAudioFadeOut` à la fermeture ; personne ne
/// l'écoutait, et `fadeOutAndStop` n'avait aucun appelant : le son continuait
/// pendant le ressort puis se coupait net. La fermeture passe désormais par
/// `PlaybackCoordinator.fadeOutAllExternal`, qui atteint le mixer du canvas
/// sans que le lecteur le tienne.
@MainActor
final class ReaderAudioMixerFadeOutTests: XCTestCase {

    func test_closing_fadesThePlayingMixerToSilenceThenStopsIt() async throws {
        let mixer = try Self.playingMixer(volume: 0.8, slideKey: "fade#0")
        PlaybackCoordinator.shared.registerExternal(mixer)
        defer { PlaybackCoordinator.shared.unregisterExternal(mixer) }

        await PlaybackCoordinator.shared.fadeOutAllExternal(duration: 0.05)

        XCTAssertFalse(mixer.isPlaying, "Le fondu se termine par l'arrêt du moteur")
        XCTAssertEqual(mixer.appliedVolume(for: "fg") ?? -1, 0, accuracy: 0.001,
                       "Le volume est descendu jusqu'au silence : un `stop()` seul le "
                       + "laisserait à 0,8, c'est-à-dire une coupure nette")
    }

    func test_fadeOut_overtakenByAFreshPass_leavesItPlaying() async throws {
        let mixer = try Self.playingMixer(volume: 1, slideKey: "fade#1")

        let fade = Task { await mixer.fadeOutAndStop(duration: 0.3) }
        try? await Task.sleep(nanoseconds: 20_000_000)
        mixer.stop()
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "fade#2")
        await fade.value

        XCTAssertTrue(mixer.isPlaying,
                      "Un fondu dépassé par une nouvelle passe ne l'arrête pas en finissant")
    }

    // MARK: - Fixtures

    private static func playingMixer(volume: Float, slideKey: String) throws -> ReaderAudioMixer {
        let fixture = try makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [StoryAudioPlayerObject(id: "fg", postMediaId: "fg",
                                                            volume: volume,
                                                            startTime: 0, duration: 3)],
                            urls: ["fg": fixture])
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: slideKey)
        return mixer
    }

    private static func makeAudioFixture(seconds: Double) throws -> URL {
        let sampleRate: Double = 8_000
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(sampleRate))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        buffer.frameLength = AVAudioFrameCount(sampleRate)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("reader-mixer-fade-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try file.write(from: buffer) }
        return url
    }
}
