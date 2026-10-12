import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#10362 — dans le composer, le son de la scène boucle sans sauter ni s'arrêter.**
///
/// Quatre causes, un témoin par cause :
/// 1. un clip de premier plan sans `loop` déclaré jouait UNE fois dans l'aperçu
///    d'édition, qui n'a pas de durée de slide — puis se taisait ;
/// 2. une boucle entrée au-delà de sa longueur ne planifiait RIEN — la fenêtre
///    était demandée hors du fichier ;
/// 3. le repos de l'horloge d'édition (4 s sans toucher) mettait le mixer en
///    pause ;
/// 4. deux canevas d'édition sonores (la scène, l'éditeur d'objet par-dessus)
///    se volaient le son et le faisaient repartir du début à chaque passage.
@MainActor
final class ComposerSceneAudioLoopTests: XCTestCase {

    // MARK: - 1. L'aperçu d'édition boucle chaque clip

    func test_loopPolicy_editPreview_loopsAForegroundClipThatDeclaresNothing() {
        XCTAssertTrue(ReaderAudioLoopPolicy.loops(declared: nil, isBackground: false, isEditPreview: true),
                      "La scène du composer n'a pas de fin : un clip joué une fois s'y tait pour de bon")
        XCTAssertTrue(ReaderAudioLoopPolicy.loops(declared: false, isBackground: true, isEditPreview: true))
    }

    func test_loopPolicy_reader_keepsTheAuthorsDeclaration() {
        XCTAssertFalse(ReaderAudioLoopPolicy.loops(declared: nil, isBackground: false, isEditPreview: false),
                       "Au lecteur, un premier plan joue une fois — la slide a une durée")
        XCTAssertTrue(ReaderAudioLoopPolicy.loops(declared: nil, isBackground: true, isEditPreview: false),
                      "Au lecteur, un fond boucle sauf refus déclaré")
        XCTAssertFalse(ReaderAudioLoopPolicy.loops(declared: false, isBackground: true, isEditPreview: false))
        XCTAssertTrue(ReaderAudioLoopPolicy.loops(declared: true, isBackground: false, isEditPreview: false))
    }

    func test_configure_loopsEveryClip_queuesAPassAheadForAClipThatDeclaresNoLoop() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "chip", loop: nil)],
                            urls: ["chip": fixture],
                            loopsEveryClip: true)

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "edit#0")

        XCTAssertEqual(recorder.passes.count, 2,
                       "En édition, la puce boucle : la passe qui joue ET la suivante sont remises au node")
    }

    func test_configure_reader_playsAClipThatDeclaresNoLoopOnce() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "chip", loop: nil)], urls: ["chip": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "read#0")

        XCTAssertEqual(recorder.passes.count, 1, "Le lecteur garde la déclaration de l'auteur")
    }

    // MARK: - 2. Une boucle entrée loin dans le temps reprend à sa phase

    func test_elapsedInPass_foldsTheElapsedOnOnePass() {
        XCTAssertEqual(ReaderLoopLaw.elapsedInPass(7.5, passLength: 3), 1.5, accuracy: 1e-9)
        XCTAssertEqual(ReaderLoopLaw.elapsedInPass(2, passLength: 3), 2, accuracy: 1e-9)
        XCTAssertEqual(ReaderLoopLaw.elapsedInPass(-1, passLength: 3), 0)
        XCTAssertEqual(ReaderLoopLaw.elapsedInPass(.nan, passLength: 3), 0)
        XCTAssertEqual(ReaderLoopLaw.elapsedInPass(5, passLength: 0), 5,
                       "Sans longueur de passe connue, la règle d'avant")
    }

    func test_play_loopingClipEnteredPastItsLength_entersAtItsPhase() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "loop", loop: true)], urls: ["loop": fixture])

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "edit#1", slideElapsed: 7.5)

        XCTAssertEqual(recorder.passes.count, 2,
                       "Une boucle n'a pas de fin : entrée à 7,5 s d'un clip de 3 s, elle joue")
        XCTAssertEqual(recorder.passes.first?.window,
                       .segment(startingFrame: 12_000, frameCount: 12_000),
                       "Elle entre à 1,5 s — la phase de 7,5 s sur une passe de 3 s")
        XCTAssertEqual(recorder.passes.first?.isImmediate, true)
    }

    func test_play_loopingBackgroundEnteredPastItsLength_entersAtItsPhase() throws {
        let fixture = try Self.makeAudioFixture(seconds: 3)
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(scheduler: recorder)
        try mixer.configureBackground(audio: Self.audio(id: "bg", loop: true), url: fixture, looping: true)

        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "edit#2", slideElapsed: 10)

        XCTAssertEqual(recorder.passes.first?.window,
                       .segment(startingFrame: 8_000, frameCount: 16_000),
                       "Le fond entre à 1 s — la phase de 10 s sur une passe de 3 s")
    }

    // MARK: - 3. Le repos de l'horloge d'édition ne coupe pas le son

    func test_idleSuspension_neverSuspendsTheSceneSound() {
        XCTAssertEqual(EditIdleSuspension.suspended(playsVideo: true, playsAudio: true), [.video],
                       "Le repos refroidit l'image ; la musique qu'on écoute en composant continue")
        XCTAssertEqual(EditIdleSuspension.suspended(playsVideo: false, playsAudio: true), [])
    }

    // MARK: - 4. Un seul propriétaire, et la main se passe sans repartir

    func test_ownership_theLastMountedCanvasPlays_andHandsBackOnLeaving() {
        let canvases = (NSObject(), NSObject())
        let scene = ObjectIdentifier(canvases.0)
        let editor = ObjectIdentifier(canvases.1)
        var ownership = EditAudioOwnership()
        XCTAssertTrue(ownership.mayPlay(scene), "Personne ne tient la main : chacun peut jouer")

        ownership.claim(scene)
        ownership.claim(editor)
        XCTAssertTrue(ownership.mayPlay(editor))
        XCTAssertFalse(ownership.mayPlay(scene),
                       "La scène sous l'éditeur se tait : sinon chaque frappe lui rendait la main")

        XCTAssertEqual(ownership.release(editor), scene,
                       "L'éditeur qui se ferme rend la main à la scène — qui doit reprendre")
        XCTAssertTrue(ownership.mayPlay(scene))
        withExtendedLifetime(canvases) {}
    }

    func test_ownership_aNonOwnerLeaving_wakesNobody() {
        let canvases = (NSObject(), NSObject())
        let scene = ObjectIdentifier(canvases.0)
        let editor = ObjectIdentifier(canvases.1)
        var ownership = EditAudioOwnership()
        ownership.claim(scene)
        ownership.claim(editor)

        XCTAssertNil(ownership.release(scene))
        XCTAssertEqual(ownership.owner, editor)
        withExtendedLifetime(canvases) {}
    }

    func test_ownership_aCanvasFreedWithoutReleasing_doesNotKeepTheHand() {
        let canvases = (NSObject(), NSObject())
        let scene = ObjectIdentifier(canvases.0)
        let gone = ObjectIdentifier(canvases.1)
        var ownership = EditAudioOwnership()
        ownership.claim(scene)
        ownership.claim(gone)

        ownership.prune(keeping: [scene])

        XCTAssertEqual(ownership.owner, scene)
        withExtendedLifetime(canvases) {}
    }

    func test_clock_aFreshPassEntersAtTheSharedPhase_notAtZero() {
        let now = mach_absolute_time()
        let origin = now - ReaderAudioMixer.hostTime(forDelaySeconds: 5)
        let phase = EditAudioPhase(slideId: "s1", originHost: origin)

        let anchor = EditAudioClock.anchor(phase: phase, slideId: "s1", now: now,
                                           fallback: (originHost: now, slideElapsed: 0))

        XCTAssertEqual(anchor.originHost, origin)
        XCTAssertEqual(anchor.slideElapsed, 5, accuracy: 0.01,
                       "Le canevas qui prend la main reprend où l'autre en était")
    }

    func test_clock_anotherSlideOrNoPhase_keepsTheCanvasAnchor() {
        let now = mach_absolute_time()
        let phase = EditAudioPhase(slideId: "s1", originHost: now - 1_000)
        let fallback = (originHost: now, slideElapsed: 0.0)

        let other = EditAudioClock.anchor(phase: phase, slideId: "s2", now: now, fallback: fallback)
        let none = EditAudioClock.anchor(phase: nil, slideId: "s1", now: now, fallback: fallback)

        XCTAssertEqual(other.originHost, now)
        XCTAssertEqual(other.slideElapsed, 0)
        XCTAssertEqual(none.originHost, now)
    }

    // MARK: - Fixtures

    private static func audio(id: String, loop: Bool?) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, postMediaId: id, volume: 1,
                               startTime: 0, duration: 3, loop: loop)
    }

    private static func makeAudioFixture(seconds: Double) throws -> URL {
        let sampleRate: Double = 8_000
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(sampleRate))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        buffer.frameLength = AVAudioFrameCount(sampleRate)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("composer-scene-loop-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<Int(seconds)).forEach { _ in try file.write(from: buffer) }
        return url
    }
}
