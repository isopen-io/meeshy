import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#10367 — une piste bouclée par l'aperçu du composer rejoue ses fondus à chaque tour.**
///
/// Les fondus se posaient une fois, à la planification de la passe : après le
/// premier fondu de sortie, le node restait à zéro et la boucle tournait muette.
/// Les témoins de loi portent sur le DEUXIÈME tour et au-delà — au premier,
/// la règle d'avant et la règle juste rendent le même volume.
@MainActor
final class ComposerLoopFadeEnvelopeTests: XCTestCase {

    // MARK: - Deux tours d'une piste avec fondus

    func test_volume_secondPass_replaysFadeInPlateauAndFadeOut() {
        let at: (Double) -> Float = {
            ReaderLoopEnvelope.volume(elapsedInClip: $0, cycle: 10, fadeIn: 1, fadeOut: 2, target: 0.8)
        }
        XCTAssertEqual(at(0), 0, accuracy: 1e-6)
        XCTAssertEqual(at(0.5), 0.4, accuracy: 1e-6)
        XCTAssertEqual(at(5), 0.8, accuracy: 1e-6)
        XCTAssertEqual(at(9), 0.4, accuracy: 1e-6)

        XCTAssertEqual(at(10), 0, accuracy: 1e-6, "Le deuxième tour repart du silence")
        XCTAssertEqual(at(10.5), 0.4, accuracy: 1e-6, "…et remonte : la piste n'est plus muette")
        XCTAssertEqual(at(15), 0.8, accuracy: 1e-6, "Volume nominal entre les deux fondus")
        XCTAssertEqual(at(19), 0.4, accuracy: 1e-6, "Le fondu de sortie se rejoue")
        XCTAssertEqual(at(25), 0.8, accuracy: 1e-6, "Et le troisième tour aussi")
    }

    func test_volume_entryMidLoop_takesTheAmplitudeOfItsPhase() {
        XCTAssertEqual(ReaderLoopEnvelope.volume(elapsedInClip: 23.5, cycle: 10,
                                                 fadeIn: 1, fadeOut: 2, target: 1),
                       ReaderLoopEnvelope.volume(elapsedInClip: 3.5, cycle: 10,
                                                 fadeIn: 1, fadeOut: 2, target: 1),
                       accuracy: 1e-6)
        XCTAssertEqual(ReaderLoopEnvelope.volume(elapsedInClip: 30.5, cycle: 10,
                                                 fadeIn: 1, fadeOut: 0, target: 1),
                       0.5, accuracy: 1e-6, "Entrée à mi-montée du quatrième tour")
    }

    func test_volume_fadesLongerThanThePass_theSmallerFactorGoverns() {
        XCTAssertEqual(ReaderLoopEnvelope.volume(elapsedInClip: 1.5, cycle: 2,
                                                 fadeIn: 2, fadeOut: 2, target: 1),
                       0.25, accuracy: 1e-6)
    }

    func test_volume_beforeTheClipStarts_isTheStartOfTheTour() {
        XCTAssertEqual(ReaderLoopEnvelope.volume(elapsedInClip: -3, cycle: 10,
                                                 fadeIn: 1, fadeOut: 2, target: 1), 0)
    }

    // MARK: - Le tour suit le rognage

    func test_cycle_previewLoop_turnsOnTheTrimmedPass() {
        let pass = ReaderLoopLaw.passLength(sourceDuration: 12,
                                            trimBounds: MediaTrimBounds(start: 2, end: 10))
        XCTAssertEqual(pass, 8, accuracy: 1e-9)
        let cycle = ReaderLoopEnvelope.cycle(declaredLoop: nil, occupiedDuration: 8, passLength: pass)
        XCTAssertEqual(cycle, 8, accuracy: 1e-9)
        XCTAssertEqual(ReaderLoopEnvelope.volume(elapsedInClip: 7.5, cycle: cycle,
                                                 fadeIn: 0, fadeOut: 1, target: 1),
                       0.5, accuracy: 1e-6, "La descente touche zéro quand la fenêtre repart")
    }

    func test_cycle_declaredLoop_framesTheOccupiedSpan() {
        XCTAssertEqual(ReaderLoopEnvelope.cycle(declaredLoop: true, occupiedDuration: 9, passLength: 3), 9)
        XCTAssertEqual(ReaderLoopEnvelope.cycle(declaredLoop: true, occupiedDuration: 0, passLength: 3), 3)
        XCTAssertEqual(ReaderLoopEnvelope.cycle(declaredLoop: nil, occupiedDuration: 5, passLength: 0), 5)
    }

    // MARK: - Ce qui ne change pas

    func test_repeatsEveryPass_onlyAPreviewLoopWithAFade() {
        XCTAssertFalse(ReaderLoopEnvelope.repeatsEveryPass(loopsEveryClip: false, fadeIn: 1, fadeOut: 1),
                       "Le lecteur garde ses fondus posés une fois")
        XCTAssertFalse(ReaderLoopEnvelope.repeatsEveryPass(loopsEveryClip: true, fadeIn: 0, fadeOut: 0),
                       "Une boucle sans fondu n'a rien à rejouer")
        XCTAssertFalse(ReaderLoopEnvelope.repeatsEveryPass(loopsEveryClip: true, fadeIn: .nan, fadeOut: -1))
        XCTAssertTrue(ReaderLoopEnvelope.repeatsEveryPass(loopsEveryClip: true, fadeIn: 0, fadeOut: 0.5))
    }

    func test_volume_loopWithoutFade_neverMoves() {
        [0, 2.999, 3, 4.5, 30].forEach { t in
            XCTAssertEqual(ReaderLoopEnvelope.volume(elapsedInClip: t, cycle: 3,
                                                     fadeIn: 0, fadeOut: 0, target: 0.7),
                           0.7, accuracy: 1e-6, "t = \(t)")
        }
    }

    // MARK: - Le mixer pose l'amplitude du tour en cours

    func test_play_previewLoopWithFades_secondPassIsAudible() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [Self.audio(id: "fade", fadeIn: 1, fadeOut: 1)],
                            urls: ["fade": fixture], loopsEveryClip: true)

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 3.5), slideKey: "edit#fade", slideElapsed: 3.5)

        // Mesure EN PLEIN fondu d'entrée (une seconde) : le temps écoulé se lit à l'application, et chaque
        // centième de retard d'un runner chargé ajoute un centième au volume (0,56 relevé en CI sur `main`).
        // 0,15 de jeu garde le témoin tranchant — sans le tour rejoué, le volume resterait à 0.
        XCTAssertEqual(mixer.appliedVolume(for: "fade") ?? -1, 0.5, accuracy: 0.15,
                       "À 0,5 s du deuxième tour, la piste remonte — elle n'est pas restée à zéro")
        mixer.shutdown()
    }

    func test_play_readerClipWithFades_keepsItsOneShotEnvelope() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [Self.audio(id: "fade", fadeIn: 1, fadeOut: 1)],
                            urls: ["fade": fixture])

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 3.5), slideKey: "read#fade", slideElapsed: 3.5)

        XCTAssertEqual(mixer.appliedVolume(for: "fade") ?? -1, 0, accuracy: 1e-6,
                       "Au lecteur, un clip passé sa fin reste muet — rien ne change")
        mixer.shutdown()
    }

    func test_play_previewLoopWithoutFade_staysAtItsVolume() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [Self.audio(id: "flat", fadeIn: nil, fadeOut: nil)],
                            urls: ["flat": fixture], loopsEveryClip: true)

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 5.9), slideKey: "edit#flat", slideElapsed: 5.9)

        XCTAssertEqual(mixer.appliedVolume(for: "flat") ?? -1, 1, accuracy: 1e-6,
                       "Une boucle sans fondu ne gagne aucune coupure")
        mixer.shutdown()
    }

    // MARK: - Fixtures

    private static func origin(secondsAgo: Double) -> UInt64 {
        mach_absolute_time() - ReaderAudioMixer.hostTime(forDelaySeconds: secondsAgo)
    }

    private static func audio(id: String, fadeIn: Float?, fadeOut: Float?) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, postMediaId: id, volume: 1,
                               startTime: 0, duration: 3, loop: nil,
                               fadeIn: fadeIn, fadeOut: fadeOut)
    }

    private static func makeAudioFixture(seconds: Double) throws -> URL {
        let sampleRate: Double = 8_000
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(sampleRate))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        buffer.frameLength = AVAudioFrameCount(sampleRate)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("composer-loop-fade-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try file.write(from: buffer) }
        return url
    }
}
