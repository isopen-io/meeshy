import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#9867 — un clip posé en boucle boucle SANS FIN, au premier plan comme au fond.**
///
/// Le premier plan replanifiait sa deuxième passe avec `completionHandler: nil` :
/// la troisième n'était jamais planifiée, le clip se taisait après deux tours.
/// Le fond, lui, se réarmait — deux jumelles qui avaient divergé.
///
/// Ces témoins passent par le transport public (`play`) et déclenchent à la
/// main la fin de chaque passe via `RecordingAudioScheduler.completePass` :
/// aucun moteur n'a besoin de rendre du son pour que la boucle soit mesurable.
@MainActor
final class ReaderAudioMixerLoopTests: XCTestCase {

    // MARK: - Premier plan

    func test_play_loopingForegroundClip_queuesTheNextPassAhead() throws {
        let (mixer, recorder) = try Self.foregroundLoop(id: "fg")

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "loop#0")

        XCTAssertEqual(recorder.passes.count, 2,
                       "La passe qui joue ET la suivante : le réarmement a une passe entière "
                       + "de marge pour traverser le fil principal sans trou audible")
        XCTAssertEqual(recorder.passes.last?.isImmediate, true,
                       "La passe d'avance suit la première, sans heure propre")
    }

    func test_play_loopingForegroundClip_keepsSchedulingPastTheSecondPass() async throws {
        let (mixer, recorder) = try Self.foregroundLoop(id: "fg")
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "loop#1")

        for finished in 0..<4 {
            recorder.completePass(finished)
            await Self.waitUntil { recorder.passes.count >= finished + 3 }
            XCTAssertEqual(recorder.passes.count, finished + 3,
                           "La fin de la passe \(finished + 1) arme la passe \(finished + 3) — "
                           + "le clip ne se tait jamais après deux tours")
        }
        XCTAssertTrue(recorder.passes.dropFirst().allSatisfy { $0.window == .wholeFile },
                      "Chaque tour repart au début de sa fenêtre")
    }

    func test_stop_endsTheForegroundLoop() async throws {
        let (mixer, recorder) = try Self.foregroundLoop(id: "fg")
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "loop#2")

        mixer.stop()
        recorder.completePass(0)
        recorder.completePass(1)
        await Self.settle()

        XCTAssertEqual(recorder.passes.count, 2,
                       "Le node arrêté rend ses handlers : aucun ne doit réarmer la boucle")
    }

    func test_aFreshPass_ignoresTheHandlersOfThePreviousOne() async throws {
        let (mixer, recorder) = try Self.foregroundLoop(id: "fg")
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "loop#3")
        mixer.stop()
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "loop#4")
        XCTAssertEqual(recorder.passes.count, 4)

        recorder.completePass(0)
        await Self.settle()

        XCTAssertEqual(recorder.passes.count, 4,
                       "Un handler de la passe arrêtée ne double pas la boucle de la nouvelle")
    }

    // MARK: - Fond : la même loi

    func test_play_loopingBackground_keepsSchedulingPastTheSecondPass() async throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configureBackground(audio: Self.audio(id: "bg", loop: true),
                                      url: fixture, looping: true)
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "loop#5")
        XCTAssertEqual(recorder.passes.count, 2)

        for finished in 0..<3 {
            recorder.completePass(finished)
            await Self.waitUntil { recorder.passes.count >= finished + 3 }
            XCTAssertEqual(recorder.passes.count, finished + 3)
        }
    }

    // MARK: - La loi pure

    func test_loopLaw_rearmsOnlyTheSamePassOnTheSameNode() {
        let nodes = (NSObject(), NSObject())
        let node = ObjectIdentifier(nodes.0)
        let other = ObjectIdentifier(nodes.1)
        XCTAssertTrue(ReaderLoopLaw.shouldRearm(capturedEpoch: 3, liveEpoch: 3,
                                                capturedNode: node, liveNode: node))
        XCTAssertFalse(ReaderLoopLaw.shouldRearm(capturedEpoch: 3, liveEpoch: 4,
                                                 capturedNode: node, liveNode: node),
                       "Une passe arrêtée ou remplacée ne se réarme plus")
        XCTAssertFalse(ReaderLoopLaw.shouldRearm(capturedEpoch: 3, liveEpoch: 3,
                                                 capturedNode: node, liveNode: other),
                       "Un slot reconfiguré porte un autre node : l'ancien handler se tait")
        XCTAssertFalse(ReaderLoopLaw.shouldRearm(capturedEpoch: 3, liveEpoch: 3,
                                                 capturedNode: node, liveNode: nil),
                       "Un slot vidé ne se réarme pas")
        withExtendedLifetime(nodes) {}
    }

    // MARK: - Fixtures

    private static func foregroundLoop(id: String) throws -> (ReaderAudioMixer, RecordingAudioScheduler) {
        let fixture = try makeAudioFixture(seconds: 3)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [audio(id: id, loop: true)], urls: [id: fixture])
        return (mixer, recorder)
    }

    private static func audio(id: String, loop: Bool) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, postMediaId: id, volume: 1,
                               startTime: 0, duration: 3, loop: loop)
    }

    /// Le réarmement traverse le fil principal par une tâche : on lui laisse le
    /// temps de passer, borné pour qu'un défaut rende un échec et non un blocage.
    private static func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
    }

    private static func settle() async {
        for _ in 0..<20 { try? await Task.sleep(nanoseconds: 5_000_000) }
    }

    private static func makeAudioFixture(seconds: Double) throws -> URL {
        let sampleRate: Double = 8_000
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(sampleRate))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        buffer.frameLength = AVAudioFrameCount(sampleRate)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("reader-mixer-loop-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try file.write(from: buffer) }
        return url
    }
}
