import CoreVideo
import XCTest
@testable import Meeshy

// #8063 — le partage d'écran d'appel, côté app : ce qui est ANNONCÉ au pair
// (`call:toggle-screen`), ce qui part sur la piste vidéo, et ce que le pair
// affiche quand c'est lui qui partage.
@MainActor
final class CallScreenShareControllerTests: XCTestCase {

    // MARK: - Doubles

    private final class MockScreenShareService: ScreenShareServiceProviding {
        var onBroadcastStarted: (@MainActor () -> Void)?
        var onBroadcastFinished: (@MainActor () -> Void)?
        var startListeningResult = true
        var startListeningCallCount = 0
        var stopListeningCallCount = 0
        var requestBroadcastStopCallCount = 0
        var sinks: [(any ScreenShareFrameSink)?] = []

        func startListening() -> Bool {
            startListeningCallCount += 1
            return startListeningResult
        }
        func stopListening() { stopListeningCallCount += 1 }
        func requestBroadcastStop() { requestBroadcastStopCallCount += 1 }
        func setFrameSink(_ sink: (any ScreenShareFrameSink)?) { sinks.append(sink) }
    }

    private final class StubSink: ScreenShareFrameSink {
        nonisolated func push(pixelBuffer: CVPixelBuffer, rotationDegrees: Int, timestampNs: Int64) {}
    }

    private struct BeginFailure: Error {}

    private final class MockRouter: ScreenShareVideoRouting {
        var beginResult: Result<Bool, Error> = .success(false)
        var endResult = false
        var beginCallCount = 0
        var endRestoreCameraArguments: [Bool] = []
        let sink = StubSink()

        func beginScreenShareTrack() async throws -> ScreenShareTrackActivation {
            beginCallCount += 1
            return ScreenShareTrackActivation(sink: sink, needsRenegotiation: try beginResult.get())
        }
        func endScreenShareTrack(restoreCamera: Bool) async -> Bool {
            endRestoreCameraArguments.append(restoreCamera)
            return endResult
        }
    }

    private final class MockHost: CallScreenShareHosting {
        var screenShareCallId: String? = "call-1"
        var screenShareRestoresCamera = false
        var router = MockRouter()
        var renegotiationCount = 0
        var screenShareRouter: (any ScreenShareVideoRouting)? { router }
        func screenShareNeedsRenegotiation() async { renegotiationCount += 1 }
    }

    private final class EmitRecorder {
        var toggles: [(callId: String, enabled: Bool)] = []
        var failures = 0
    }

    private func makeSUT() -> (sut: CallScreenShareController, service: MockScreenShareService, host: MockHost, emits: EmitRecorder) {
        let service = MockScreenShareService()
        let host = MockHost()
        let emits = EmitRecorder()
        let sut = CallScreenShareController(
            service: service,
            emitToggle: { emits.toggles.append(($0, $1)) },
            reportFailure: { emits.failures += 1 }
        )
        sut.host = host
        return (sut, service, host, emits)
    }

    // MARK: - Local sharing

    func test_prepareBroadcast_startsListeningForTheExtension() {
        let (sut, service, _, _) = makeSUT()

        XCTAssertTrue(sut.prepareBroadcast())
        XCTAssertEqual(service.startListeningCallCount, 1)
    }

    func test_prepareBroadcast_withoutCall_refusesAndDoesNotListen() {
        let (sut, service, host, _) = makeSUT()
        host.screenShareCallId = nil

        XCTAssertFalse(sut.prepareBroadcast())
        XCTAssertEqual(service.startListeningCallCount, 0)
    }

    func test_broadcastDidStart_routesFramesAndAnnouncesToPeer() async {
        let (sut, service, host, emits) = makeSUT()

        await sut.broadcastDidStart().value

        XCTAssertTrue(sut.isSharing)
        XCTAssertEqual(host.router.beginCallCount, 1)
        XCTAssertTrue(service.sinks.last! === host.router.sink)
        XCTAssertEqual(emits.toggles.map(\.callId), ["call-1"])
        XCTAssertEqual(emits.toggles.map(\.enabled), [true])
        XCTAssertEqual(host.renegotiationCount, 0)
    }

    func test_broadcastDidStart_onAudioCall_renegotiatesSoThePeerReceivesVideo() async {
        let (sut, _, host, _) = makeSUT()
        host.router.beginResult = .success(true)

        await sut.broadcastDidStart().value

        XCTAssertEqual(host.renegotiationCount, 1)
    }

    func test_broadcastDidStart_trackFailure_stopsBroadcastWithoutAnnouncing() async {
        let (sut, service, host, emits) = makeSUT()
        host.router.beginResult = .failure(BeginFailure())

        await sut.broadcastDidStart().value

        XCTAssertFalse(sut.isSharing)
        XCTAssertEqual(service.requestBroadcastStopCallCount, 1)
        XCTAssertTrue(emits.toggles.isEmpty)
        XCTAssertEqual(emits.failures, 1)
    }

    func test_broadcastDidStart_afterCallEnded_stopsBroadcast() async {
        let (sut, service, host, emits) = makeSUT()
        host.screenShareCallId = nil

        await sut.broadcastDidStart().value

        XCTAssertFalse(sut.isSharing)
        XCTAssertEqual(host.router.beginCallCount, 0)
        XCTAssertEqual(service.requestBroadcastStopCallCount, 1)
        XCTAssertTrue(emits.toggles.isEmpty)
    }

    func test_broadcastDidFinish_givesTheCameraBackAndAnnouncesStop() async {
        let (sut, service, host, emits) = makeSUT()
        host.screenShareRestoresCamera = true
        await sut.broadcastDidStart().value

        await sut.broadcastDidFinish().value

        XCTAssertFalse(sut.isSharing)
        XCTAssertEqual(host.router.endRestoreCameraArguments, [true])
        XCTAssertNil(service.sinks.last!)
        XCTAssertEqual(emits.toggles.map(\.enabled), [true, false])
    }

    func test_broadcastDidFinish_withCameraOff_renegotiatesBackToAudio() async {
        let (sut, _, host, _) = makeSUT()
        host.router.endResult = true
        await sut.broadcastDidStart().value

        await sut.broadcastDidFinish().value

        XCTAssertEqual(host.router.endRestoreCameraArguments, [false])
        XCTAssertEqual(host.renegotiationCount, 1)
    }

    func test_broadcastDidFinish_whenNotSharing_isInert() async {
        let (sut, _, host, emits) = makeSUT()

        await sut.broadcastDidFinish().value

        XCTAssertTrue(host.router.endRestoreCameraArguments.isEmpty)
        XCTAssertTrue(emits.toggles.isEmpty)
    }

    func test_startThenFinishBackToBack_finishWaitsForTheStart() async {
        let (sut, _, host, emits) = makeSUT()

        let start = sut.broadcastDidStart()
        let finish = sut.broadcastDidFinish()
        await start.value
        await finish.value

        XCTAssertFalse(sut.isSharing)
        XCTAssertEqual(host.router.endRestoreCameraArguments.count, 1)
        XCTAssertEqual(emits.toggles.map(\.enabled), [true, false])
    }

    func test_stopSharing_asksTheExtensionToFinish() {
        let (sut, service, _, _) = makeSUT()

        sut.stopSharing()

        XCTAssertEqual(service.requestBroadcastStopCallCount, 1)
    }

    func test_announceIfSharing_reannouncesOnlyWhileSharing() async {
        let (sut, _, _, emits) = makeSUT()
        sut.announceIfSharing()
        XCTAssertTrue(emits.toggles.isEmpty)

        await sut.broadcastDidStart().value
        sut.announceIfSharing()

        XCTAssertEqual(emits.toggles.map(\.enabled), [true, true])
    }

    func test_callEnded_stopsBroadcastAndResetsEverything() async {
        let (sut, service, _, _) = makeSUT()
        await sut.broadcastDidStart().value
        _ = sut.applyRemoteScreenShare(enabled: true)

        sut.callEnded()

        XCTAssertFalse(sut.isSharing)
        XCTAssertFalse(sut.isRemoteSharing)
        XCTAssertEqual(service.requestBroadcastStopCallCount, 1)
        XCTAssertEqual(service.stopListeningCallCount, 1)
        XCTAssertNil(service.sinks.last!)
    }

    func test_serviceCallbacks_driveTheController() async {
        let (sut, service, _, emits) = makeSUT()

        service.onBroadcastStarted?()
        await sut.pendingTransition?.value

        XCTAssertTrue(sut.isSharing)
        XCTAssertEqual(emits.toggles.map(\.enabled), [true])
    }

    // MARK: - Remote sharing (what the peer shows)

    func test_remoteScreenShare_showsTheStreamEvenWithThePeerCameraOff() {
        let (sut, _, _, _) = makeSUT()
        XCTAssertFalse(sut.applyRemoteCamera(enabled: false))

        XCTAssertTrue(sut.applyRemoteScreenShare(enabled: true))
        XCTAssertTrue(sut.isRemoteSharing)
    }

    func test_remoteScreenShareStop_fallsBackToThePeerCameraState() {
        let (sut, _, _, _) = makeSUT()
        _ = sut.applyRemoteScreenShare(enabled: true)

        XCTAssertTrue(sut.applyRemoteScreenShare(enabled: false))
        _ = sut.applyRemoteScreenShare(enabled: true)
        _ = sut.applyRemoteCamera(enabled: false)
        XCTAssertFalse(sut.applyRemoteScreenShare(enabled: false))
    }

    func test_remoteCameraOffDuringScreenShare_keepsTheScreenVisible() {
        let (sut, _, _, _) = makeSUT()
        _ = sut.applyRemoteScreenShare(enabled: true)

        XCTAssertTrue(sut.applyRemoteCamera(enabled: false))
    }
}
