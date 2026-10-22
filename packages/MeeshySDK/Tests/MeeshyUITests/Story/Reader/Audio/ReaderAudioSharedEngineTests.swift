import XCTest
import AVFoundation
import Darwin
import MeeshySDK
@testable import MeeshyUI

/// **#9878 — un seul moteur audio par lecteur, et un son qui reprend seul.**
///
/// Avant ce lot, chaque canevas créait son `AVAudioEngine` (jusqu'à 4 dans le
/// lecteur de stories, 5 autour d'un réel, un par carte-scène visible), et aucun
/// n'observait `AVAudioEngineConfigurationChange` : brancher des AirPods pendant
/// une story arrêtait le moteur, et le son ne revenait qu'au changement de slide.
///
/// Ces témoins passent par le TRANSPORT PUBLIC du mixer (`configure`, `play`,
/// `pause`, `stop`, `shutdown`) et par les deux entrées système de l'hôte
/// (`engineConfigurationDidChange(of:)`, `mediaServicesWereReset()`), que les
/// observateurs de notifications appellent sur le fil principal.
@MainActor
final class ReaderAudioSharedEngineTests: XCTestCase {

    // MARK: - Au plus un moteur vivant par lecteur

    func test_fiveCanvasMixers_onOneReaderHost_shareASingleEngine() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let mixers = (0..<5).map { _ in
            ReaderAudioMixer(engineHost: host, scheduler: RecordingAudioScheduler())
        }

        try mixers.forEach { try $0.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture]) }

        XCTAssertTrue(mixers.allSatisfy { $0.engine === host.engine },
                      "chaque canevas attache ses nodes au moteur du lecteur, aucun n'en crée un")
        XCTAssertEqual(host.enginesBuilt, 1)
        XCTAssertEqual(Self.playerNodeCount(on: host.engine), 5,
                       "la fenêtre se prépare en nodes sur UN moteur, pas en moteurs")
    }

    func test_shutdown_detachesTheMixerNodes_fromTheSharedEngine() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let kept = ReaderAudioMixer(engineHost: host, scheduler: RecordingAudioScheduler())
        let leaving = ReaderAudioMixer(engineHost: host, scheduler: RecordingAudioScheduler())
        try kept.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        try leaving.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        try leaving.configureBackground(audio: Self.audio(id: "bg"), url: fixture, looping: false)

        leaving.shutdown()

        XCTAssertEqual(Self.playerNodeCount(on: host.engine), 1,
                       "un canevas qui part rend ses nodes : le moteur partagé ne les garde pas")
        XCTAssertEqual(kept.activeClipCount, 1)
    }

    func test_stoppingAPausedNeighbour_keepsTheEngineRunning_forThePlayingMixer() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let playing = ReaderAudioMixer(engineHost: host, scheduler: RecordingAudioScheduler())
        let neighbour = ReaderAudioMixer(engineHost: host, scheduler: RecordingAudioScheduler())
        try playing.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        try neighbour.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        _ = try playing.play(originHost: mach_absolute_time(), slideKey: "k#on")

        neighbour.stop()
        neighbour.pause()

        XCTAssertTrue(host.engine.isRunning,
                      "un voisin qui s'arrête n'arrête pas le son de la page affichée")
        playing.stop()
        XCTAssertFalse(host.engine.isRunning, "plus personne ne joue : le moteur s'endort")
    }

    // MARK: - La loi de repos du moteur partagé

    func test_idleLaw_keepsRunning_whileAnyClientPlays() {
        XCTAssertEqual(ReaderAudioEngineIdleLaw.action(anyClientPlaying: true, anyClientHoldsNodes: true),
                       .keepRunning)
        XCTAssertEqual(ReaderAudioEngineIdleLaw.action(anyClientPlaying: true, anyClientHoldsNodes: false),
                       .keepRunning)
    }

    func test_idleLaw_pausesWhileNodesWait_andStopsWhenNothingIsAttached() {
        XCTAssertEqual(ReaderAudioEngineIdleLaw.action(anyClientPlaying: false, anyClientHoldsNodes: true),
                       .pause,
                       "un voisin préparé attend : le moteur garde ses ressources, la page suivante démarre sans allocation")
        XCTAssertEqual(ReaderAudioEngineIdleLaw.action(anyClientPlaying: false, anyClientHoldsNodes: false),
                       .stop)
    }

    // MARK: - Changement de sortie (AirPods, haut-parleur, CarPlay)

    func test_configurationChange_restartsTheEngine_andReplansThePlayingMixer() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(engineHost: host, scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        _ = try mixer.play(originHost: mach_absolute_time() - Self.hostTicks(seconds: 2),
                           slideKey: "k#route")
        host.engine.stop()

        host.engineConfigurationDidChange(of: ObjectIdentifier(host.engine))

        XCTAssertTrue(host.engine.isRunning, "le moteur repart seul après le changement de sortie")
        XCTAssertEqual(recorder.passes.count, 2, "la passe est replanifiée, pas laissée muette")
        XCTAssertEqual(recorder.passes.last?.isImmediate, true,
                       "replanifiée DEPUIS L'ANCRE : on entre en cours de piste, tout de suite")
        guard case let .segment(startingFrame, _)? = recorder.passes.last?.window else {
            return XCTFail("une reprise en cours de piste se planifie en segment")
        }
        XCTAssertGreaterThanOrEqual(startingFrame, AVAudioFramePosition(2 * Self.sampleRate),
                                    "le son reprend où en est la slide, jamais au début du fichier")
        XCTAssertTrue(mixer.isPlaying)
    }

    func test_configurationChange_ofAnotherEngine_isIgnored() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(engineHost: host, scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#other")
        let foreign = AVAudioEngine()

        host.engineConfigurationDidChange(of: ObjectIdentifier(foreign))

        XCTAssertEqual(recorder.passes.count, 1,
                       "le moteur d'un appel ou du composer n'a rien à dire au lecteur")
    }

    func test_configurationChange_leavesAPausedMixerSilent() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let recorder = RecordingAudioScheduler()
        let mixer = ReaderAudioMixer(engineHost: host, scheduler: recorder)
        try mixer.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "k#pause")
        mixer.pause()

        host.engineConfigurationDidChange(of: ObjectIdentifier(host.engine))

        XCTAssertEqual(recorder.passes.count, 1, "une story en pause ne se remet pas à parler")
        XCTAssertFalse(host.engine.isRunning)
        XCTAssertFalse(mixer.isPlaying)
    }

    // MARK: - Services média réinitialisés

    func test_mediaServicesReset_rebuildsOneEngine_andReattachesEveryNode() throws {
        let fixture = try Self.makeAudioFixture()
        let host = ReaderAudioEngineHost()
        let recorder = RecordingAudioScheduler()
        let playing = ReaderAudioMixer(engineHost: host, scheduler: recorder)
        let neighbour = ReaderAudioMixer(engineHost: host, scheduler: RecordingAudioScheduler())
        try playing.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        try playing.configureBackground(audio: Self.audio(id: "bg"), url: fixture, looping: false)
        try neighbour.configure(audios: [Self.audio(id: "fg")], urls: ["fg": fixture])
        _ = try playing.play(originHost: mach_absolute_time(), slideKey: "k#reset")
        let dead = host.engine

        host.mediaServicesWereReset()

        XCTAssertFalse(host.engine === dead, "le moteur d'avant la réinitialisation est mort")
        XCTAssertEqual(host.enginesBuilt, 2)
        XCTAssertTrue(playing.loopSource(for: .foreground("fg"))?.node.engine === host.engine)
        XCTAssertTrue(playing.loopSource(for: .background)?.node.engine === host.engine)
        XCTAssertTrue(neighbour.loopSource(for: .foreground("fg"))?.node.engine === host.engine,
                      "le voisin préparé est rattaché aussi : la page suivante joue sans reconfiguration")
        XCTAssertEqual(Self.playerNodeCount(on: host.engine), 3)
        XCTAssertEqual(recorder.passes.count, 4,
                       "la page affichée replanifie avant-plan ET fond sur le moteur neuf")
        XCTAssertTrue(playing.isPlaying)
        XCTAssertTrue(host.engine.isRunning)
    }

    // MARK: - Les fichiers s'ouvrent hors du fil principal

    func test_loadAndConfigure_configuresTheSameClipsAsTheSynchronousPath() async throws {
        let fixture = try Self.makeAudioFixture()
        let mixer = ReaderAudioMixer(engineHost: ReaderAudioEngineHost(),
                                     scheduler: RecordingAudioScheduler())

        try await mixer.loadAndConfigure(audios: [Self.audio(id: "fg"), Self.audio(id: "absent")],
                                         urls: ["fg": fixture])
        try await mixer.loadAndConfigureBackground(audio: Self.audio(id: "bg"), url: fixture,
                                                   looping: false)

        XCTAssertEqual(mixer.activeClipCount, 1, "un clip sans fichier est sauté, comme avant")
        XCTAssertEqual(mixer.backgroundClipCount, 1)
    }

    func test_aLoadOvertakenByANewerConfiguration_isDropped() async throws {
        let fixture = try Self.makeAudioFixture()
        let mixer = ReaderAudioMixer(engineHost: ReaderAudioEngineHost(),
                                     scheduler: RecordingAudioScheduler())
        let before = mixer.configurationTicket

        let stale = Task { try await mixer.loadAndConfigure(audios: [Self.audio(id: "old")],
                                                            urls: ["old": fixture]) }
        for _ in 0..<1_000 where mixer.configurationTicket == before { await Task.yield() }
        try mixer.configure(audios: [Self.audio(id: "new")], urls: ["new": fixture])
        try await stale.value

        XCTAssertNotNil(mixer.loopSource(for: .foreground("new")))
        XCTAssertNil(mixer.loopSource(for: .foreground("old")),
                     "une slide quittée pendant l'ouverture de ses fichiers n'écrase pas la suivante")
    }

    func test_unreadableBackground_throws_andKeepsThePriorBackground() async throws {
        let fixture = try Self.makeAudioFixture()
        let mixer = ReaderAudioMixer(engineHost: ReaderAudioEngineHost(),
                                     scheduler: RecordingAudioScheduler())
        try mixer.configureBackground(audio: Self.audio(id: "bg"), url: fixture, looping: false)
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent("absent-\(UUID().uuidString).caf")

        do {
            try await mixer.loadAndConfigureBackground(audio: Self.audio(id: "bg2"), url: missing,
                                                       looping: false)
            XCTFail("un fichier illisible se signale")
        } catch {}

        XCTAssertTrue(mixer.loopSource(for: .background)?.node.engine === mixer.engine,
                      "le fond déjà prêt reste attaché quand le suivant ne s'ouvre pas")
    }

    // MARK: - Fixtures

    private static let sampleRate: Double = 8_000

    private static func audio(id: String) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: id, postMediaId: id, volume: 1,
                               startTime: 0, duration: 10, loop: false,
                               fadeIn: nil, fadeOut: nil)
    }

    private static func playerNodeCount(on engine: AVAudioEngine) -> Int {
        engine.attachedNodes.filter { $0 is AVAudioPlayerNode }.count
    }

    private static func hostTicks(seconds: Double) -> UInt64 {
        ReaderAudioMixer.hostTime(forDelaySeconds: seconds)
    }

    private static func makeAudioFixture(seconds: Int = 10) throws -> URL {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(sampleRate))
        else { throw XCTSkip("AVAudioFormat indisponible sur cet hôte") }
        buffer.frameLength = AVAudioFrameCount(sampleRate)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("shared-engine-\(UUID().uuidString).caf")
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try (0..<seconds).forEach { _ in try file.write(from: buffer) }
        return url
    }
}
