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
        var requestedKinds: [CallRecordingKind] = []
        var answers: [(callId: String, recordingId: String, accepted: Bool)] = []
        var stops: [(callId: String, recordingId: String)] = []

        var callRecordingEvents: AnyPublisher<CallRecordingSocketEvent, Never> {
            Empty().eraseToAnyPublisher()
        }

        func requestCallRecording(callId: String, kind: CallRecordingKind) async throws -> String {
            requests.append(callId)
            requestedKinds.append(kind)
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
        var finishedFiles: [URL] = []

        func start(fileURL: URL) throws {
            if let startError { throw startError }
            startedFiles.append(fileURL)
        }

        func stop() -> URL? {
            stopCallCount += 1
            return capturedFile
        }

        func finish(_ fileURL: URL) async throws -> URL {
            finishedFiles.append(fileURL)
            return fileURL
        }
    }

    private final class MockUploader: CallRecordingUploading {
        var uploads: [URL] = []
        var mimeTypes: [String] = []

        func upload(fileURL: URL, mimeType: String) async throws -> String {
            uploads.append(fileURL)
            mimeTypes.append(mimeType)
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
        let videoRecorder: MockRecorder
        let uploader: MockUploader
        let remote: MockRemote
        let host: MockHost
    }

    private func makeSUT(viewerId: String = "u-me") -> SUT {
        let socket = MockSocket()
        let recorder = MockRecorder()
        let videoRecorder = MockRecorder()
        videoRecorder.capturedFile = URL(fileURLWithPath: "/tmp/appel.mp4")
        let uploader = MockUploader()
        let remote = MockRemote()
        let host = MockHost()
        let sut = CallRecordingController(
            socket: socket,
            recorder: recorder,
            videoRecorder: videoRecorder,
            uploader: uploader,
            remote: remote,
            viewerId: { viewerId },
            wait: { _ in },
            fileDirectory: URL(fileURLWithPath: "/tmp"),
            events: Empty().eraseToAnyPublisher()
        )
        sut.host = host
        return SUT(sut: sut, socket: socket, recorder: recorder, videoRecorder: videoRecorder, uploader: uploader, remote: remote, host: host)
    }

    private func requested(callId: String = "call-1", requesterId: String = "u-peer", required: [String] = ["u-me"], kind: CallRecordingKind = .audio) -> CallRecordingSocketEvent {
        .requested(CallRecordingRequestedEvent(callId: callId, recordingId: "rec-1", requesterId: requesterId, requiredUserIds: required, kind: kind))
    }

    private func started(callId: String = "call-1", recorderId: String = "u-me", kind: CallRecordingKind = .audio) -> CallRecordingSocketEvent {
        .started(CallRecordingStartedEvent(callId: callId, recordingId: "rec-1", recorderId: recorderId, kind: kind))
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

    // MARK: - Type d'enregistrement (#8437)

    func test_request_video_asksForAVideoRecording() async {
        let env = makeSUT()

        await env.sut.request(kind: .video)?.value

        XCTAssertEqual(env.socket.requestedKinds, [.video])
        XCTAssertEqual(env.sut.kind, .video)
    }

    func test_request_default_asksForAudioOnly() async {
        let env = makeSUT()

        await env.sut.request()?.value

        XCTAssertEqual(env.socket.requestedKinds, [.audio])
        XCTAssertEqual(env.sut.kind, .audio)
    }

    func test_requested_video_tellsTheConsentingViewerItIsAVideo() {
        let env = makeSUT()

        env.sut.receive(requested(kind: .video))

        XCTAssertEqual(env.sut.kind, .video)
    }

    func test_started_video_capturesWithTheVideoRecorder_intoAnMP4() {
        let env = makeSUT()

        env.sut.receive(started(kind: .video))

        XCTAssertEqual(env.videoRecorder.startedFiles.map(\.lastPathComponent), ["appel-call-1-rec-1.mp4"])
        XCTAssertTrue(env.recorder.startedFiles.isEmpty)
    }

    func test_video_isFinishedThenDepositedAsAVideo() async {
        let env = makeSUT()
        env.sut.receive(started(kind: .video))

        env.sut.callEnded()
        await env.sut.pendingSave?.value

        XCTAssertEqual(env.videoRecorder.stopCallCount, 1)
        XCTAssertEqual(env.videoRecorder.finishedFiles.map(\.lastPathComponent), ["appel.mp4"])
        XCTAssertEqual(env.uploader.mimeTypes, ["video/mp4"])
        XCTAssertEqual(env.sut.notice, .saved)
    }

    func test_audio_isDepositedAsAudio() async {
        let env = makeSUT()
        env.sut.receive(started())

        env.sut.callEnded()
        await env.sut.pendingSave?.value

        XCTAssertEqual(env.recorder.finishedFiles.count, 1)
        XCTAssertEqual(env.uploader.mimeTypes, ["audio/mp4"])
    }

    // MARK: - #17790 R2.2 — la carte nomme CELUI QUI DEMANDE

    func test_phase_pending_exposesTheRequester_notThePrimaryPeer() {
        let env = makeSUT()
        env.sut.receive(requested(requesterId: "u-karim"))

        XCTAssertEqual(env.sut.phase.requesterId, "u-karim")
        XCTAssertNil(CallRecordingPhase.idle.requesterId)
        XCTAssertNil(CallRecordingPhase.asking(callId: "call-1").requesterId)
        XCTAssertNil(CallRecordingPhase.recording(callId: "c", recordingId: "r", recorderId: "u", mine: false).requesterId)
    }

    func test_requesterName_isWhoAsked_notThePrimaryPeer_andAnUnknownNameSaysSomeone() {
        let roster = ["u-awa": "Awa", "u-karim": "Karim"]
        let resolve: (String) -> String = { roster[$0] ?? "" }
        let env = makeSUT()
        env.sut.receive(requested(requesterId: "u-karim"))

        XCTAssertEqual(env.sut.phase.requesterName(resolvedBy: resolve), "Karim", "celui qui demande, pas le pair principal")
        let stranger = CallRecordingPhase.pending(callId: "c", recordingId: "r", requesterId: "u-inconnu", mine: false, mustAnswer: true)
        XCTAssertEqual(stranger.requesterName(resolvedBy: resolve), "")
        XCTAssertEqual(CallRecordingPhase.idle.requesterName(resolvedBy: resolve), "")
        XCTAssertFalse(CallRecordingCopy.someone.isEmpty)
        XCTAssertEqual(CallRecordingCopy.ask(name: "", kind: .video), CallRecordingCopy.ask(name: CallRecordingCopy.someone, kind: .video), "un nom inconnu se dit « Un participant »")
        XCTAssertTrue(CallRecordingCopy.ask(name: "Karim").contains("Karim"))
    }

    func test_consentCard_namesTheRequesterFromTheRoster_neverTheCallTitle() throws {
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        XCTAssertTrue(stack.contains("requesterName: recording.phase.requesterName(resolvedBy: participantName)"), "Le nom vient du demandeur résolu")
        XCTAssertFalse(stack.contains("requesterName: remoteName"), "remoteUsername est le titre du groupe, pas le demandeur")
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        XCTAssertTrue(connected.contains("participantName: callManager.participantName(for:)"))
    }

    // MARK: - #17790 R2.10 — la carte repart vers le haut

    func test_bannerStage_followsThePhase() {
        let pending: (Bool) -> CallRecordingPhase = { .pending(callId: "c", recordingId: "r", requesterId: "u", mine: false, mustAnswer: $0) }
        XCTAssertEqual(CallRecordingBannerStage.of(phase: pending(true), notice: nil), .consent)
        XCTAssertEqual(CallRecordingBannerStage.of(phase: pending(false), notice: nil), .status)
        XCTAssertEqual(CallRecordingBannerStage.of(phase: .asking(callId: "c"), notice: nil), .status)
        XCTAssertEqual(CallRecordingBannerStage.of(phase: .recording(callId: "c", recordingId: "r", recorderId: "u", mine: true), notice: nil), .status)
        XCTAssertEqual(CallRecordingBannerStage.of(phase: .idle, notice: .saved), .notice)
        XCTAssertEqual(CallRecordingBannerStage.of(phase: .idle, notice: nil), .none)
    }

    func test_overlay_leavesAndEntersByTheTop_andFadesAlone_underReduceMotion() throws {
        let controls = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallRecordingControls.swift"))
        XCTAssertTrue(controls.contains(".move(edge: .top).combined(with: .opacity)"))
        XCTAssertTrue(controls.contains("reduceMotion ? .opacity"))
        XCTAssertTrue(controls.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: stage)"))
        let overlay = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var content: some View", in: controls))
        XCTAssertTrue(overlay.contains("case .asking, .pending, .recording:"), "attente puis enregistrement : la MÊME capsule change de mot, elle n'est pas remplacée d'un coup")
        XCTAssertTrue(controls.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: phase.isRecording)"))
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        XCTAssertTrue(stack.contains("value: CallRecordingBannerStage.of("), "Les bandeaux suivants glissent quand la hauteur change")
    }

    // MARK: - #17790 R3.6 — la capsule se range en montant avec l'en-tête

    func test_statusCapsule_isStowedByTheTopEdge_withTheHeader() throws {
        let controls = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallRecordingControls.swift"))
        XCTAssertTrue(controls.contains("CallEdgeStow(edge: .top, margin: topInset, isVisible: showsStatus, reduceMotion: reduceMotion)"))
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        XCTAssertTrue(stack.contains("topInset: topInset"))
    }
}
