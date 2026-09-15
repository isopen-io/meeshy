import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#6580 / D1 — ce que le mixer REMET au moteur, pas ce qu'il calcule.**
///
/// `ReaderAudioMixerMidClipEntryTests` éprouve la LOI (`TimelineAudioWindow`) :
/// pure, statique, parfaitement testée. Son APPLICATION ne l'était pas. Entre
/// la loi et le son, il reste deux décisions que `scheduleEntry` /
/// `startBackground` prennent seuls, et qu'aucune valeur calculée ne porte :
///
/// 1. la frame de départ est-elle bien celle que la loi rend ?
/// 2. **l'heure** est-elle bien `at: nil` ? Un clip planifié à une heure DÉJÀ
///    PASSÉE est joué par `AVAudioPlayerNode` depuis sa frame 0 — la loi juste,
///    la lecture fausse, et aucun témoin de loi ne tombe.
///
/// Ces témoins passent donc par le TRANSPORT PUBLIC (`play`, `startBackground`)
/// sur un vrai `AVAudioFile`, et lisent ce qui atteint le node via le seam
/// `ReaderAudioSchedulerProviding`.
@MainActor
final class ReaderAudioMixerSchedulingTests: XCTestCase {

    /// 8 kHz mono : une fixture de 12 s pèse 384 Ko et se génère en quelques
    /// millisecondes. Le taux n'a aucune importance — la loi travaille en
    /// secondes puis convertit.
    private let sampleRate: Double = 8_000
    private let seconds: Double = 12

    // MARK: - Avant-plan : la frame ET l'heure

    func test_play_enteringMidClip_schedulesTheElapsedFrame_immediately() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 1, duration: 11)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#1", slideElapsed: 4)

        // La slide est à 4 s, le clip démarre à 1 s ⇒ on entre à 3 s DANS la
        // source, et il reste 9 s de fichier.
        XCTAssertEqual(recorder.passes.count, 1)
        XCTAssertEqual(recorder.passes.first?.window,
                       .segment(startingFrame: 3 * 8_000, frameCount: 9 * 8_000),
                       "La frame remise au node est celle que la loi rend — jamais zéro")
        XCTAssertEqual(recorder.passes.first?.isImmediate, true,
                       "at: nil — une heure future est DÉJÀ PASSÉE ici, et le node "
                       + "rejouerait le fichier depuis sa frame 0")
    }

    func test_play_fromZero_keepsTheWholeFileAtItsFutureHostTime() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 1, duration: 11)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#0")

        XCTAssertEqual(recorder.passes.first?.window, .wholeFile,
                       "Non-régression : à l'ouverture nominale, le chemin est celui d'avant")
        XCTAssertEqual(recorder.passes.first?.isImmediate, false,
                       "Le clip attend son heure — c'est ce qui le met en phase avec le canvas")
    }

    // MARK: - Le fond : le cas nominal du porteur

    func test_play_backgroundEnteringMidTrack_schedulesTheElapsedFrame_immediately() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configureBackground(audio: Self.audio(id: "bg", startTime: 2, duration: 10),
                                      url: fixture,
                                      looping: false)

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#2", slideElapsed: 5)

        XCTAssertEqual(recorder.passes.count, 1)
        XCTAssertEqual(recorder.passes.first?.window,
                       .segment(startingFrame: 3 * 8_000, frameCount: 9 * 8_000),
                       "« ouverture en détail on joue le son directement aligné » : le fond "
                       + "entre à 3 s, il ne recommence pas")
        XCTAssertEqual(recorder.passes.first?.isImmediate, true)
    }

    func test_play_backgroundFromZero_keepsTheWholeFileAtItsFutureHostTime() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configureBackground(audio: Self.audio(id: "bg", startTime: 2, duration: 10),
                                      url: fixture,
                                      looping: false)

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#3")

        XCTAssertEqual(recorder.passes.first?.window, .wholeFile)
        XCTAssertEqual(recorder.passes.first?.isImmediate, false)
    }

    func test_play_openingPastTheEndOfTheClip_schedulesNothing() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 0, duration: 12)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#4", slideElapsed: 20)

        XCTAssertTrue(recorder.passes.isEmpty,
                      "Rejouer le fichier depuis zéro sous une vidéo déjà à t serait pire "
                      + "que le silence : il a l'air d'une lecture désynchronisée")
    }

    // MARK: - D2 : l'enveloppe de volume suit la position

    func test_play_enteringMidFadeIn_startsAtTheMatchingAmplitude() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 0, duration: 12,
                                                fadeIn: 2, volume: 1)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#5", slideElapsed: 1)

        XCTAssertEqual(mixer.appliedVolume(for: "fg") ?? -1, 0.5, accuracy: 0.001,
                       "Entrée à la moitié du fade-in ⇒ moitié du volume. Rejouer la montée "
                       + "depuis le silence rendrait le clip inaudible pendant tout le fade.")
    }

    func test_play_fromZeroWithAFadeIn_stillStartsSilent() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 0, duration: 12,
                                                fadeIn: 2, volume: 1)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#6")

        XCTAssertEqual(mixer.appliedVolume(for: "fg") ?? -1, 0, accuracy: 0.001,
                       "Non-régression : à zéro, la montée part bien du silence")
    }

    func test_play_enteringAfterTheFadeIn_startsAtFullVolume() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 0, duration: 12,
                                                fadeIn: 2, volume: 0.8)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#7", slideElapsed: 5)

        XCTAssertEqual(mixer.appliedVolume(for: "fg") ?? -1, 0.8, accuracy: 0.001)
    }

    func test_play_enteringMidFadeOut_startsAtTheRemainingAmplitude() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        // Descente sur les 2 dernières secondes d'un clip de 10 s : à 9 s on est
        // à mi-descente.
        try mixer.configure(audios: [Self.audio(id: "fg", startTime: 0, duration: 10,
                                                fadeIn: 1, fadeOut: 2, volume: 1)],
                            urls: ["fg": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#8", slideElapsed: 9)

        XCTAssertEqual(mixer.appliedVolume(for: "fg") ?? -1, 0.5, accuracy: 0.001,
                       "Passé le déclencheur du fade-out, les DEUX rampes tiraient à la même "
                       + "milliseconde sur le même node.volume")
    }

    func test_play_backgroundEnteringMidFadeIn_startsAtTheMatchingAmplitude() throws {
        let fixture = try Self.makeAudioFixture(seconds: seconds, sampleRate: sampleRate)
        let mixer = ReaderAudioMixer(scheduler: RecordingAudioScheduler())
        try mixer.configureBackground(audio: Self.audio(id: "bg", startTime: 0, duration: 12,
                                                        fadeIn: 4, volume: 1),
                                      url: fixture,
                                      looping: false)

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#9", slideElapsed: 3)

        XCTAssertEqual(mixer.appliedBackgroundVolume() ?? -1, 0.75, accuracy: 0.001,
                       "Le fond partage la loi du foreground — c'est LUI que le porteur écoute")
    }

    // MARK: - La loi pure, sans moteur

    func test_envelope_atZero_isExactlyWhatTheReaderPosedBefore() {
        let plan = AudioEnvelope.plan(elapsedInClip: 0, fadeIn: 2, fadeOut: 3,
                                      clipDuration: 10, target: 1)
        XCTAssertEqual(plan.initialVolume, 0)
        XCTAssertEqual(plan.fadeIn, AudioEnvelope.Ramp(from: 0, to: 1, startOffset: 0, duration: 2))
        XCTAssertEqual(plan.fadeOut, AudioEnvelope.Ramp(from: 1, to: 0, startOffset: 7, duration: 3))
    }

    func test_envelope_pastTheEndOfTheClip_isSilentAndPosesNoRamp() {
        let plan = AudioEnvelope.plan(elapsedInClip: 12, fadeIn: 2, fadeOut: 3,
                                      clipDuration: 10, target: 1)
        XCTAssertEqual(plan.initialVolume, 0)
        XCTAssertNil(plan.fadeIn)
        XCTAssertNil(plan.fadeOut)
    }

    func test_envelope_nonFiniteElapsed_behavesLikeZero() {
        XCTAssertEqual(AudioEnvelope.plan(elapsedInClip: .nan, fadeIn: 2, fadeOut: 0,
                                          clipDuration: 10, target: 1),
                       AudioEnvelope.plan(elapsedInClip: 0, fadeIn: 2, fadeOut: 0,
                                          clipDuration: 10, target: 1))
    }

    // MARK: - Fixtures

    private static func audio(id: String,
                              startTime: Float,
                              duration: Float,
                              fadeIn: Float? = nil,
                              fadeOut: Float? = nil,
                              volume: Float = 1) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, postMediaId: id,
                               volume: volume,
                               startTime: startTime, duration: duration,
                               loop: false, fadeIn: fadeIn, fadeOut: fadeOut)
    }

    /// Un fichier audio RÉEL — `AVAudioFile(forReading:)` est la seule porte du
    /// mixer, et un faux fichier ne porterait ni `length` ni `processingFormat`.
    private static func makeAudioFixture(seconds: Double, sampleRate: Double) throws -> URL {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(sampleRate))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        buffer.frameLength = AVAudioFrameCount(sampleRate)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("reader-mixer-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try file.write(from: buffer) }
        return url
    }
}

/// Le seam d'observation : il ENREGISTRE ce que le mixer remet, sans toucher au
/// node. Aucun `AVAudioEngine` n'a donc besoin de rendre du son pour que la
/// planification soit mesurable.
@MainActor
final class RecordingAudioScheduler: ReaderAudioSchedulerProviding {

    nonisolated struct Pass: Equatable, Sendable {
        let window: ReaderAudioScheduleWindow
        /// `at == nil` — la seconde moitié d'une entrée en cours de piste.
        let isImmediate: Bool
    }

    private(set) var passes: [Pass] = []

    func schedule(node: AVAudioPlayerNode,
                  file: AVAudioFile,
                  window: ReaderAudioScheduleWindow,
                  at: AVAudioTime?,
                  completionHandler: (@Sendable () -> Void)?) {
        passes.append(Pass(window: window, isImmediate: at == nil))
    }
}
