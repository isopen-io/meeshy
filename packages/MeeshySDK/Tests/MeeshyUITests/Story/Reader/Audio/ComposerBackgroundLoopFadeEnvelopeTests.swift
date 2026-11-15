import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#10369 — la piste de FOND bouclée par l'aperçu du composer rejoue ses fondus à chaque tour.**
///
/// Jumelle de `ComposerLoopFadeEnvelopeTests` (#10367) pour le slot de fond :
/// `configureBackground` posait ses fondus une fois (`AudioEnvelope`), et un
/// fond bouclé restait muet après son premier fondu de sortie. Les témoins
/// portent sur le DEUXIÈME tour — au premier, l'ancienne règle et la juste
/// rendent le même volume.
@MainActor
final class ComposerBackgroundLoopFadeEnvelopeTests: XCTestCase {

    func test_startBackground_previewLoopWithFades_secondPassIsAudible() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configureBackground(audio: Self.audio(fadeIn: 1, fadeOut: 1),
                                      url: fixture, looping: true, loopsEveryClip: true)

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 3.5), slideKey: "edit#bg", slideElapsed: 3.5)

        // Mesure EN PLEIN fondu d'entrée (une seconde) : le temps écoulé se lit à l'application, et chaque
        // centième de retard d'un runner chargé ajoute un centième au volume (0,56 relevé en CI sur `main`).
        // 0,15 de jeu garde le témoin tranchant — sans le tour rejoué, le volume resterait à 0.
        XCTAssertEqual(mixer.appliedBackgroundVolume() ?? -1, 0.5, accuracy: 0.15,
                       "À 0,5 s du deuxième tour, le fond remonte — il n'est pas resté à zéro")
        mixer.shutdown()
    }

    func test_startBackground_previewLoopWithFades_secondFadeOutReplays() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configureBackground(audio: Self.audio(fadeIn: 1, fadeOut: 1),
                                      url: fixture, looping: true, loopsEveryClip: true)

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 5.5), slideKey: "edit#bg", slideElapsed: 5.5)

        // La mesure tombe EN PLEIN fondu de sortie (une seconde) : le temps écoulé se lit à l'application,
        // et chaque centième de retard d'un runner chargé retire un centième au volume (0,44 relevé en CI sur
        // `main`). 0,15 de jeu garde le témoin tranchant — sans le fondu rejoué, le fond serait à 1.
        XCTAssertEqual(mixer.appliedBackgroundVolume() ?? -1, 0.5, accuracy: 0.15,
                       "À 0,5 s de la fin du deuxième tour, le fondu de sortie se rejoue")
        mixer.shutdown()
    }

    func test_startBackground_readerBackgroundWithFades_keepsItsOneShotEnvelope() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configureBackground(audio: Self.audio(fadeIn: 1, fadeOut: 1),
                                      url: fixture, looping: true)

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 3.5), slideKey: "read#bg", slideElapsed: 3.5)

        XCTAssertEqual(mixer.appliedBackgroundVolume() ?? -1,
                       Self.oneShotVolume(elapsedInClip: 3.5), accuracy: 1e-6,
                       "Au lecteur, le fond garde ses fondus posés une fois — rien ne change")
        mixer.shutdown()
    }

    func test_startBackground_previewLoopWithoutFade_staysAtItsVolume() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configureBackground(audio: Self.audio(fadeIn: nil, fadeOut: nil),
                                      url: fixture, looping: true, loopsEveryClip: true)

        _ = try mixer.play(originHost: Self.origin(secondsAgo: 5.9), slideKey: "edit#flat", slideElapsed: 5.9)

        XCTAssertEqual(mixer.appliedBackgroundVolume() ?? -1, 1, accuracy: 1e-6,
                       "Un fond bouclé sans fondu ne gagne aucune coupure")
        mixer.shutdown()
    }

    func test_backgroundCycle_followsTheEffectiveDeclaration() {
        XCTAssertEqual(ReaderLoopEnvelope.backgroundCycle(declaredLoop: nil, occupiedDuration: 9, passLength: 3), 9,
                       "Un fond sans déclaration boucle par défaut : ses fondus encadrent le span occupé")
        XCTAssertEqual(ReaderLoopEnvelope.backgroundCycle(declaredLoop: false, occupiedDuration: 9, passLength: 3), 3,
                       "Un fond qui ne boucle pas au lecteur tourne à la passe réelle dans l'aperçu")
        XCTAssertEqual(ReaderLoopEnvelope.backgroundCycle(declaredLoop: true, occupiedDuration: 0, passLength: 3), 3)
    }

    // MARK: - Fixtures

    private static func oneShotVolume(elapsedInClip: Double) -> Float {
        AudioEnvelope.plan(elapsedInClip: elapsedInClip, fadeIn: 1, fadeOut: 1,
                           clipDuration: 3, target: 1).initialVolume
    }

    private static func origin(secondsAgo: Double) -> UInt64 {
        mach_absolute_time() - ReaderAudioMixer.hostTime(forDelaySeconds: secondsAgo)
    }

    private static func audio(fadeIn: Float?, fadeOut: Float?) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "bg", postMediaId: "bg", volume: 1,
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
            .appendingPathComponent("composer-bg-loop-fade-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try file.write(from: buffer) }
        return url
    }
}
