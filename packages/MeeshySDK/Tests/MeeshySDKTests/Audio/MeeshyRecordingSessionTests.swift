#if os(iOS)
import XCTest
@testable import MeeshySDK

/// #11042 — un vocal ou une vidéo filmée dans Meeshy pendant qu'un son Meeshy
/// joue : le son BAISSE, l'enregistrement se fait, puis il REMONTE au volume
/// qu'il avait, et la session revient à la lecture (ou se rend).
@MainActor
final class MeeshyRecordingSessionTests: XCTestCase {

    private final class FakePlayer: PlaybackVolumeTarget {
        nonisolated deinit {}
        var volume: Float
        init(volume: Float) { self.volume = volume }
    }

    private final class FakeSource: AudiblePlaybackSource {
        nonisolated deinit {}
        var playing: [FakePlayer] = []
        var audibleVolumeTargets: [any PlaybackVolumeTarget] { playing }
    }

    /// Répond tout de suite, ou garde la réponse (`answersLater`) pour la
    /// rendre quand le témoin le décide — la pose de session hors du fil
    /// principal (#17038).
    private final class FakeSession: RecordingSessionControlling, @unchecked Sendable {
        var accepts = true
        var answersLater = false
        private(set) var pendingAnswers: [@MainActor @Sendable (Bool) -> Void] = []
        private(set) var configured: [(RecordingSessionConfiguration, Bool)] = []
        private(set) var holdReleases = 0
        private(set) var handBacks: [RecordingSessionHandBack] = []

        func configureRecordingSession(
            _ configuration: RecordingSessionConfiguration,
            holding: Bool,
            completion: @escaping @MainActor @Sendable (Bool) -> Void
        ) {
            configured.append((configuration, holding))
            guard !answersLater else { return pendingAnswers.append(completion) }
            let accepts = accepts
            MainActor.assumeIsolated { completion(accepts) }
        }

        @MainActor func answer(_ accepted: Bool) {
            let answers = pendingAnswers
            pendingAnswers = []
            answers.forEach { $0(accepted) }
        }
        func releaseRecordingHold() { holdReleases += 1 }
        func handBackSession(_ handBack: RecordingSessionHandBack) { handBacks.append(handBack) }
    }

    @MainActor private final class Verdict {
        nonisolated deinit {}
        var value: Bool?
    }

    private func makeSUT() -> (sut: MeeshyRecordingSession, session: FakeSession, source: FakeSource, ducker: RecordingPlaybackDucker) {
        let session = FakeSession()
        let ducker = RecordingPlaybackDucker()
        let source = FakeSource()
        ducker.register(source)
        return (MeeshyRecordingSession(session: session, ducker: ducker), session, source, ducker)
    }

    func test_begin_whileAMeeshySoundPlays_lowersItWithoutStoppingIt() async {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        let began = await sut.begin(.voiceMessage)
        XCTAssertTrue(began)

        XCTAssertEqual(pip.volume, PlaybackDuckLedger.duckedFactor)
        XCTAssertEqual(session.configured.first?.0, RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: true))
        XCTAssertEqual(session.configured.first?.1, true)
    }

    func test_finish_afterAVoiceMessage_restoresTheVolumeAndGivesThePlaybackSessionBack() async {
        let (sut, session, source, _) = makeSUT()
        let voiceNote = FakePlayer(volume: 0.7)
        source.playing = [voiceNote]
        _ = await sut.begin(.voiceMessage)

        sut.finish(handingBackSession: true)

        XCTAssertEqual(voiceNote.volume, 0.7)
        XCTAssertEqual(session.holdReleases, 1)
        XCTAssertEqual(session.handBacks, [.returnToContentPlayback])
    }

    func test_finish_withNothingLeftPlaying_releasesTheSessionForTheOtherApps() async {
        let (sut, session, _, _) = makeSUT()
        _ = await sut.begin(.voiceMessage)

        sut.finish(handingBackSession: true)

        XCTAssertEqual(session.handBacks, [.releaseSession])
    }

    func test_begin_refusedDuringACall_touchesNoPlayer() async {
        let (sut, session, source, _) = makeSUT()
        session.accepts = false
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        let began = await sut.begin(.voiceMessage)
        XCTAssertFalse(began)

        XCTAssertEqual(pip.volume, 1)
    }

    func test_finishWithoutBegin_changesNothing() async {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 0.5)
        source.playing = [pip]

        sut.finish(handingBackSession: true)

        XCTAssertEqual(pip.volume, 0.5)
        XCTAssertTrue(session.handBacks.isEmpty)
        XCTAssertEqual(session.holdReleases, 0)
    }

    func test_aVolumeTheUserMovedDuringTheRecording_isNotOverwritten() async {
        let (sut, _, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        _ = await sut.begin(.voiceMessage)

        pip.volume = 0
        sut.finish(handingBackSession: true)

        XCTAssertEqual(pip.volume, 0)
    }

    func test_aPlayerReleasedDuringTheRecording_isForgotten() async {
        let (sut, session, source, _) = makeSUT()
        source.playing = [FakePlayer(volume: 1)]
        _ = await sut.begin(.voiceMessage)

        source.playing = []
        sut.finish(handingBackSession: true)

        XCTAssertEqual(session.handBacks, [.releaseSession])
    }

    func test_camera_recordingEnd_keepsTheSessionUntilTheViewfinderCloses() async {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        sut.prepare(.video)
        _ = await sut.begin(.video)

        sut.finish(handingBackSession: false)

        XCTAssertEqual(pip.volume, 1)
        XCTAssertTrue(session.handBacks.isEmpty)

        sut.handBack()

        XCTAssertEqual(session.handBacks, [.returnToContentPlayback])
    }

    func test_camera_prepare_configuresWithoutHoldingNorDucking() async {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        sut.prepare(.video)

        XCTAssertEqual(pip.volume, 1)
        XCTAssertEqual(session.configured.first?.1, false)
    }

    func test_camera_handBackWithoutPrepare_doesNothing() async {
        let (sut, session, _, _) = makeSUT()

        sut.handBack()

        XCTAssertTrue(session.handBacks.isEmpty)
    }

    func test_camera_closingMidRecording_restoresTheVolumeToo() async {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        _ = await sut.begin(.video)

        sut.handBack()

        XCTAssertEqual(pip.volume, 1)
        XCTAssertEqual(session.holdReleases, 1)
        XCTAssertEqual(session.handBacks.count, 1)
    }

    /// #17038 — le son baisse TOUT DE SUITE, sans attendre la session.
    func test_begin_lowersTheMeeshySoundBeforeTheSessionIsReady() {
        let (sut, session, source, _) = makeSUT()
        session.answersLater = true
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        sut.begin(.voiceMessage) { _ in }

        XCTAssertEqual(pip.volume, PlaybackDuckLedger.duckedFactor)
        session.answer(true)
    }

    /// #17038 — un arrêt avant que la session ne soit prête l'emporte : aucun
    /// enregistreur ne démarre, et la prise est rendue (à son rang, après la
    /// pose, sur la file du coordinateur).
    func test_finishBeforeTheSessionIsReady_winsOverTheLateAnswer() {
        let (sut, session, source, _) = makeSUT()
        session.answersLater = true
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        let verdict = Verdict()
        sut.begin(.voiceMessage) { verdict.value = $0 }

        sut.finish(handingBackSession: true)
        session.answer(true)

        XCTAssertEqual(verdict.value, false)
        XCTAssertEqual(pip.volume, 1)
        XCTAssertEqual(session.holdReleases, 1)
        XCTAssertEqual(session.handBacks, [.returnToContentPlayback])
    }

    /// #17038 — une session refusée (appel commencé entre-temps) remonte le
    /// son baissé.
    func test_aLateRefusal_restoresTheVolume() {
        let (sut, session, source, _) = makeSUT()
        session.answersLater = true
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        let verdict = Verdict()
        sut.begin(.voiceMessage) { verdict.value = $0 }

        session.answer(false)

        XCTAssertEqual(verdict.value, false)
        XCTAssertEqual(pip.volume, 1)
        sut.finish(handingBackSession: true)
        XCTAssertTrue(session.handBacks.isEmpty)
    }

    func test_beginTwice_ducksOnce() async {
        let (sut, _, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        _ = await sut.begin(.video)
        _ = await sut.begin(.video)
        sut.finish(handingBackSession: true)

        XCTAssertEqual(pip.volume, 1)
    }
}
#endif
