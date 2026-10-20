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

    private final class FakeSession: RecordingSessionControlling, @unchecked Sendable {
        var accepts = true
        private(set) var configured: [(RecordingSessionConfiguration, Bool)] = []
        private(set) var holdReleases = 0
        private(set) var handBacks: [RecordingSessionHandBack] = []

        func configureRecordingSession(_ configuration: RecordingSessionConfiguration, holding: Bool) -> Bool {
            configured.append((configuration, holding))
            return accepts
        }
        func releaseRecordingHold() { holdReleases += 1 }
        func handBackSession(_ handBack: RecordingSessionHandBack) { handBacks.append(handBack) }
    }

    private func makeSUT() -> (sut: MeeshyRecordingSession, session: FakeSession, source: FakeSource, ducker: RecordingPlaybackDucker) {
        let session = FakeSession()
        let ducker = RecordingPlaybackDucker()
        let source = FakeSource()
        ducker.register(source)
        return (MeeshyRecordingSession(session: session, ducker: ducker), session, source, ducker)
    }

    func test_begin_whileAMeeshySoundPlays_lowersItWithoutStoppingIt() {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        XCTAssertTrue(sut.begin(.voiceMessage))

        XCTAssertEqual(pip.volume, PlaybackDuckLedger.duckedFactor)
        XCTAssertEqual(session.configured.first?.0, RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: true))
        XCTAssertEqual(session.configured.first?.1, true)
    }

    func test_finish_afterAVoiceMessage_restoresTheVolumeAndGivesThePlaybackSessionBack() {
        let (sut, session, source, _) = makeSUT()
        let voiceNote = FakePlayer(volume: 0.7)
        source.playing = [voiceNote]
        sut.begin(.voiceMessage)

        sut.finish(handingBackSession: true)

        XCTAssertEqual(voiceNote.volume, 0.7)
        XCTAssertEqual(session.holdReleases, 1)
        XCTAssertEqual(session.handBacks, [.returnToContentPlayback])
    }

    func test_finish_withNothingLeftPlaying_releasesTheSessionForTheOtherApps() {
        let (sut, session, _, _) = makeSUT()
        sut.begin(.voiceMessage)

        sut.finish(handingBackSession: true)

        XCTAssertEqual(session.handBacks, [.releaseSession])
    }

    func test_begin_refusedDuringACall_touchesNoPlayer() {
        let (sut, session, source, _) = makeSUT()
        session.accepts = false
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        XCTAssertFalse(sut.begin(.voiceMessage))

        XCTAssertEqual(pip.volume, 1)
    }

    func test_finishWithoutBegin_changesNothing() {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 0.5)
        source.playing = [pip]

        sut.finish(handingBackSession: true)

        XCTAssertEqual(pip.volume, 0.5)
        XCTAssertTrue(session.handBacks.isEmpty)
        XCTAssertEqual(session.holdReleases, 0)
    }

    func test_aVolumeTheUserMovedDuringTheRecording_isNotOverwritten() {
        let (sut, _, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        sut.begin(.voiceMessage)

        pip.volume = 0
        sut.finish(handingBackSession: true)

        XCTAssertEqual(pip.volume, 0)
    }

    func test_aPlayerReleasedDuringTheRecording_isForgotten() {
        let (sut, session, source, _) = makeSUT()
        source.playing = [FakePlayer(volume: 1)]
        sut.begin(.voiceMessage)

        source.playing = []
        sut.finish(handingBackSession: true)

        XCTAssertEqual(session.handBacks, [.releaseSession])
    }

    func test_camera_recordingEnd_keepsTheSessionUntilTheViewfinderCloses() {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        sut.prepare(.video)
        sut.begin(.video)

        sut.finish(handingBackSession: false)

        XCTAssertEqual(pip.volume, 1)
        XCTAssertTrue(session.handBacks.isEmpty)

        sut.handBack()

        XCTAssertEqual(session.handBacks, [.returnToContentPlayback])
    }

    func test_camera_prepare_configuresWithoutHoldingNorDucking() {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        sut.prepare(.video)

        XCTAssertEqual(pip.volume, 1)
        XCTAssertEqual(session.configured.first?.1, false)
    }

    func test_camera_handBackWithoutPrepare_doesNothing() {
        let (sut, session, _, _) = makeSUT()

        sut.handBack()

        XCTAssertTrue(session.handBacks.isEmpty)
    }

    func test_camera_closingMidRecording_restoresTheVolumeToo() {
        let (sut, session, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]
        sut.begin(.video)

        sut.handBack()

        XCTAssertEqual(pip.volume, 1)
        XCTAssertEqual(session.holdReleases, 1)
        XCTAssertEqual(session.handBacks.count, 1)
    }

    func test_beginTwice_ducksOnce() {
        let (sut, _, source, _) = makeSUT()
        let pip = FakePlayer(volume: 1)
        source.playing = [pip]

        sut.begin(.video)
        sut.begin(.video)
        sut.finish(handingBackSession: true)

        XCTAssertEqual(pip.volume, 1)
    }
}
#endif
