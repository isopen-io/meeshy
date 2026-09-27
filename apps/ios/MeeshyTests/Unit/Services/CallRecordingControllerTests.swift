import Combine
import MeeshySDK
import XCTest
@testable import Meeshy

// #8064 — l'enregistrement d'un appel, côté app : rien ne se capte sans que
// la passerelle ait annoncé l'accord de tous ET désigné ce lecteur comme
// enregistreur ; toute annonce d'arrêt éteint la capture ; une annonce d'un
// autre appel est ignorée ; le fichier capté rejoint la bulle de l'appel.
@MainActor
final class CallRecordingControllerTests: XCTestCase {

    // MARK: - Doubles

    private final class MockSocket: CallRecordingSocketProviding, @unchecked Sendable {
        var requestResult: Result<String, CallRecordingRefusal> = .success("rec-1")
        var requests: [String] = []
        var answers: [(callId: String, recordingId: String, accepted: Bool)] = []
        var stops: [(callId: String, recordingId: String)] = []

        var callRecordingEvents: AnyPublisher<CallRecordingSocketEvent, Never> {
            Empty().eraseToAnyPublisher()
        }

        func requestCallRecording(callId: String) async throws -> String {
            requests.append(callId)
            return try requestResult.get()
        }

        func answerCallRecording(callId: String, recordingId: String, accepted: Bool) async throws {
            answers.append((callId, recordingId, accepted))
        }

        func stopCallRecording(callId: String, recordingId: String) async throws {
            stops.append((callId, recordingId))
        }
    }

    private struct CaptureFailure: Error {}

    private final class MockRecorder: CallRecordingServiceProviding {
        var startError: Error?
        var capturedFile: URL? = URL(fileURLWithPath: "/tmp/appel.m4a")
        var startedFiles: [URL] = []
        var stopCallCount = 0

        func start(fileURL: URL) throws {
            if let startError { throw startError }
            startedFiles.append(fileURL)
        }

        func stop() -> URL? {
            stopCallCount += 1
            return capturedFile
        }
    }

    private final class MockUploader: CallRecordingUploading {
        var uploads: [URL] = []

        func upload(fileURL: URL) async throws -> String {
            uploads.append(fileURL)
            return "att-1"
        }
    }

    private final class MockRemote: CallRecordingRemoteServiceProviding, @unchecked Sendable {
        var failures: [Error] = []
        var links: [(callId: String, recordingId: String, attachmentId: String)] = []

        func link(callId: String, recordingId: String, attachmentId: String) async throws -> APICallRecordingLink {
            links.append((callId, recordingId, attachmentId))
            if !failures.isEmpty { throw failures.removeFirst() }
            return APICallRecordingLink(recordingId: recordingId, messageId: "msg-1", attachmentId: attachmentId)
        }
    }

    private final class MockHost: CallRecordingHosting {
        var recordingCallId: String? = "call-1"
    }

    private struct SUT {
        let sut: CallRecordingController
        let socket: MockSocket
        let recorder: MockRecorder
        let uploader: MockUploader
        let remote: MockRemote
        let host: MockHost
    }

    private func makeSUT(viewerId: String = "u-me") -> SUT {
        let socket = MockSocket()
        let recorder = MockRecorder()
        let uploader = MockUploader()
        let remote = MockRemote()
        let host = MockHost()
        let sut = CallRecordingController(
            socket: socket,
            recorder: recorder,
            uploader: uploader,
            remote: remote,
            viewerId: { viewerId },
            wait: { _ in },
            fileDirectory: URL(fileURLWithPath: "/tmp"),
            events: Empty().eraseToAnyPublisher()
        )
        sut.host = host
        return SUT(sut: sut, socket: socket, recorder: recorder, uploader: uploader, remote: remote, host: host)
    }

    private func requested(callId: String = "call-1", requesterId: String = "u-peer", required: [String] = ["u-me"]) -> CallRecordingSocketEvent {
        .requested(CallRecordingRequestedEvent(callId: callId, recordingId: "rec-1", requesterId: requesterId, requiredUserIds: required))
    }

    private func started(callId: String = "call-1", recorderId: String = "u-me") -> CallRecordingSocketEvent {
        .started(CallRecordingStartedEvent(callId: callId, recordingId: "rec-1", recorderId: recorderId))
    }

    private func stopped(recordingId: String = "rec-1", reason: String, wasRecording: Bool) -> CallRecordingSocketEvent {
        .stopped(CallRecordingStoppedEvent(callId: "call-1", recordingId: recordingId, reason: reason, byUserId: nil, wasRecording: wasRecording))
    }

    // MARK: - Consentement

    func test_receive_requestFromPeer_asksTheViewerToConsent() {
        let env = makeSUT()

        env.sut.receive(requested())

        XCTAssertEqual(env.sut.phase, .pending(callId: "call-1", recordingId: "rec-1", requesterId: "u-peer", mine: false, mustAnswer: true))
    }

    func test_receive_requestForAnotherCall_isIgnored() {
        let env = makeSUT()

        env.sut.receive(requested(callId: "call-2"))

        XCTAssertEqual(env.sut.phase, .idle)
    }

    func test_receive_withoutActiveCall_isIgnored() {
        let env = makeSUT()
        env.host.recordingCallId = nil

        env.sut.receive(started())

        XCTAssertEqual(env.sut.phase, .idle)
        XCTAssertTrue(env.recorder.startedFiles.isEmpty)
    }

    func test_answer_sendsTheViewersChoice_andStopsAsking() async {
        let env = makeSUT()
        env.sut.receive(requested())

        await env.sut.answer(accepted: false)?.value

        XCTAssertEqual(env.socket.answers.map(\.accepted), [false])
        XCTAssertEqual(env.sut.phase, .pending(callId: "call-1", recordingId: "rec-1", requesterId: "u-peer", mine: false, mustAnswer: false))
    }

    func test_answer_whenNotAsked_sendsNothing() {
        let env = makeSUT()
        env.sut.receive(requested(required: ["u-other"]))

        XCTAssertNil(env.sut.answer(accepted: true))
        XCTAssertTrue(env.socket.answers.isEmpty)
    }

    // MARK: - Demande

    func test_request_acknowledged_waitsForEveryone() async {
        let env = makeSUT()

        await env.sut.request()?.value

        XCTAssertEqual(env.socket.requests, ["call-1"])
        XCTAssertEqual(env.sut.phase, .pending(callId: "call-1", recordingId: "rec-1", requesterId: "u-me", mine: true, mustAnswer: false))
        XCTAssertTrue(env.recorder.startedFiles.isEmpty)
    }

    func test_request_refused_returnsToIdle_withTheReason() async {
        let env = makeSUT()
        env.socket.requestResult = .failure(CallRecordingRefusal(code: "NO_PEER_TO_CONSENT"))

        await env.sut.request()?.value

        XCTAssertEqual(env.sut.phase, .idle)
        XCTAssertEqual(env.sut.notice, .unavailable(code: "NO_PEER_TO_CONSENT"))
    }

    // MARK: - Capture

    func test_started_namingTheViewer_startsCapture() {
        let env = makeSUT()

        env.sut.receive(started())

        XCTAssertEqual(env.sut.phase, .recording(callId: "call-1", recordingId: "rec-1", recorderId: "u-me", mine: true))
        XCTAssertEqual(env.recorder.startedFiles.map(\.lastPathComponent), ["appel-call-1-rec-1.m4a"])
    }

    func test_started_namingAPeer_showsTheIndicator_withoutCapturing() {
        let env = makeSUT()

        env.sut.receive(started(recorderId: "u-peer"))

        XCTAssertTrue(env.sut.phase.isRecording)
        XCTAssertTrue(env.recorder.startedFiles.isEmpty)
    }

    func test_stopped_whenSomeoneJoins_endsCapture_andSavesToTheCallBubble() async {
        let env = makeSUT()
        env.sut.receive(started())

        env.sut.receive(stopped(reason: "participant-joined", wasRecording: true))
        await env.sut.pendingSave?.value

        XCTAssertEqual(env.recorder.stopCallCount, 1)
        XCTAssertEqual(env.sut.phase, .idle)
        XCTAssertEqual(env.uploader.uploads.count, 1)
        XCTAssertEqual(env.remote.links.map(\.attachmentId), ["att-1"])
        XCTAssertEqual(env.sut.notice, .saved)
    }

    func test_stopped_forAnotherRecording_isIgnored() {
        let env = makeSUT()
        env.sut.receive(started())

        env.sut.receive(stopped(recordingId: "rec-other", reason: "refused", wasRecording: false))

        XCTAssertTrue(env.sut.phase.isRecording)
        XCTAssertEqual(env.recorder.stopCallCount, 0)
    }

    /// Deux avis se succèdent, et le témoin lit chacun à SON instant (#8327) :
    /// « arrêté » tout de suite, au geste, puis « ajouté à la conversation »
    /// quand le fichier a rejoint la bulle — comme l'arrêt décidé par la
    /// passerelle et comme le miroir web (`call-recording.ts`, `finish`).
    /// Lire le premier APRÈS avoir attendu l'émission vers la passerelle
    /// mesurait une course avec le dépôt, que le dépôt gagne.
    func test_stop_byTheViewer_endsCapture_andTellsTheGateway() async {
        let env = makeSUT()
        env.sut.receive(started())

        let emission = env.sut.stop()

        XCTAssertEqual(env.sut.phase, .idle)
        XCTAssertEqual(env.sut.notice, .stopped(reason: "stopped", wasRecording: true))
        await emission?.value
        await env.sut.pendingSave?.value
        XCTAssertEqual(env.recorder.stopCallCount, 1)
        XCTAssertEqual(env.socket.stops.map(\.recordingId), ["rec-1"])
        XCTAssertEqual(env.remote.links.map(\.attachmentId), ["att-1"])
        XCTAssertEqual(env.sut.notice, .saved)
    }

    func test_captureFailure_stopsTheRecordingForEveryone() async {
        let env = makeSUT()
        env.recorder.startError = CaptureFailure()

        env.sut.receive(started())
        await env.sut.pendingStopEmission?.value

        XCTAssertEqual(env.sut.phase, .idle)
        XCTAssertEqual(env.sut.notice, .saveFailed)
        XCTAssertEqual(env.socket.stops.map(\.recordingId), ["rec-1"])
    }

    func test_callEnded_whileRecording_stillSavesTheFile() async {
        let env = makeSUT()
        env.sut.receive(started())

        env.sut.callEnded()
        await env.sut.pendingSave?.value

        XCTAssertEqual(env.sut.phase, .idle)
        XCTAssertEqual(env.remote.links.count, 1)
    }

    func test_nothingCaptured_uploadsNothing() async {
        let env = makeSUT()
        env.recorder.capturedFile = nil
        env.sut.receive(started())

        env.sut.callEnded()
        await env.sut.pendingSave?.value

        XCTAssertTrue(env.uploader.uploads.isEmpty)
    }

    // MARK: - Rattachement

    func test_link_beforeTheBubbleExists_retries() async {
        let env = makeSUT()
        env.remote.failures = [APIError.serverError(409, "CALL_BUBBLE_MISSING")]
        env.sut.receive(started())

        env.sut.callEnded()
        await env.sut.pendingSave?.value

        XCTAssertEqual(env.remote.links.count, 2)
        XCTAssertEqual(env.sut.notice, .saved)
    }

    func test_link_forbidden_reportsTheFailure_withoutRetrying() async {
        let env = makeSUT()
        env.remote.failures = [APIError.serverError(403, "NOT_THE_RECORDER")]
        env.sut.receive(started())

        env.sut.callEnded()
        await env.sut.pendingSave?.value

        XCTAssertEqual(env.remote.links.count, 1)
        XCTAssertEqual(env.sut.notice, .saveFailed)
    }
}
