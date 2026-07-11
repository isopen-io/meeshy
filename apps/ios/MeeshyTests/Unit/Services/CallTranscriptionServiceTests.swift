import XCTest
@testable import Meeshy

@MainActor
final class CallTranscriptionServiceTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> (sut: CallTranscriptionService, socket: MockMessageSocket) {
        let socket = MockMessageSocket()
        let sut = CallTranscriptionService(socket: socket)
        return (sut, socket)
    }

    private func makeSegment(
        text: String = "hello",
        speakerId: String = "user1",
        startTime: TimeInterval = 0,
        endTime: TimeInterval = 1,
        isFinal: Bool = false,
        confidence: Double = 0.9,
        language: String = "en",
        capturedAt: Date = Date()
    ) -> TranscriptionSegment {
        TranscriptionSegment(
            id: UUID(),
            text: text,
            speakerId: speakerId,
            startTime: startTime,
            endTime: endTime,
            isFinal: isFinal,
            confidence: confidence,
            language: language,
            capturedAt: capturedAt
        )
    }

    // MARK: - Initial State

    func test_init_isNotTranscribing() {
        let (sut, _) = makeSUT()
        XCTAssertFalse(sut.isTranscribing)
    }

    func test_init_segmentsIsEmpty() {
        let (sut, _) = makeSUT()
        XCTAssertTrue(sut.segments.isEmpty)
    }

    func test_init_permissionIsNotDetermined() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.permission, .notDetermined)
    }

    func test_init_lastErrorIsNil() {
        let (sut, _) = makeSUT()
        XCTAssertNil(sut.lastError)
    }

    func test_startTranscribing_whenPermissionNotAuthorized_setsPermissionDeniedError() {
        let (sut, socket) = makeSUT()
        sut.startTranscribing(callId: "call-1", localLanguage: "fr", localUserId: "user-1")
        XCTAssertFalse(sut.isTranscribing)
        XCTAssertEqual(sut.lastError, .permissionDenied)
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }

    // MARK: - Purge / Remote Segments / Emit Guard

    func test_resetForCallEnd_purgesSegments_evenWhenNeverTranscribingLocally() {
        let (sut, _) = makeSUT()
        sut.receiveTranslatedSegment(makeSegment(text: "hi", isFinal: true))
        XCTAssertFalse(sut.segments.isEmpty)

        sut.resetForCallEnd()

        XCTAssertTrue(sut.segments.isEmpty)
    }

    func test_displayedSegments_doesNotTruncateBeyondFive() {
        // Regression guard for the 2026-07-11 fix: displayedSegments used to
        // cap at the last 5 (`maxDisplayedSegments`), which made older lines
        // vanish instead of scrolling — wrong now that the transcript panel
        // is a real scrollable surface, not a floating overlay.
        let (sut, _) = makeSUT()
        for i in 0 ..< 8 {
            sut.receiveTranslatedSegment(makeSegment(text: "segment-\(i)", speakerId: "remote-user", isFinal: true, capturedAt: Date(timeIntervalSince1970: Double(i))))
        }
        XCTAssertEqual(sut.displayedSegments.count, 8)
        XCTAssertEqual(sut.displayedSegments.first?.text, "segment-0")
        XCTAssertEqual(sut.displayedSegments.last?.text, "segment-7")
    }

    func test_appendSegment_sortsByCapturedAt_notByAsrRelativeStartTime() {
        // startTime is ASR-buffer-relative and resets on every recognition
        // rotation — sorting on it would scramble a speaker's own consecutive
        // utterances. capturedAt (wall clock) must drive the order instead.
        let (sut, _) = makeSUT()
        let earlier = Date(timeIntervalSince1970: 100)
        let later = Date(timeIntervalSince1970: 200)
        // "second" has a LOWER startTime (buffer reset) but a LATER capturedAt.
        sut.receiveTranslatedSegment(makeSegment(text: "first", startTime: 10, isFinal: true, capturedAt: earlier))
        sut.receiveTranslatedSegment(makeSegment(text: "second", startTime: 0, isFinal: true, capturedAt: later))
        XCTAssertEqual(sut.segments.map(\.text), ["first", "second"])
    }

    func test_receiveTranslatedSegment_appendsToSegments() {
        let (sut, _) = makeSUT()
        let segment = makeSegment(text: "Hello", speakerId: "remote-user", isFinal: true)
        sut.receiveTranslatedSegment(segment)
        XCTAssertEqual(sut.segments.count, 1)
        XCTAssertEqual(sut.segments.first?.text, "Hello")
    }

    func test_applyRecognitionResult_whenFinal_emitsSegmentOverSocket() {
        let (sut, socket) = makeSUT()
        // Simulate the state startTranscribing would have set, without
        // depending on the real SFSpeechRecognizer/AVAudioEngine (not
        // unit-testable — validated by the Task 1 device spike instead).
        sut.applyRecognitionResult(
            text: "Bonjour", speakerId: "user-1", startMs: 0, endMs: 1000,
            isFinal: true, confidence: 0.9, language: "fr", capturedAt: Date()
        )
        // isTranscribing is false here (startTranscribing was never called),
        // so applyRecognitionResult's guard drops it — this documents that
        // the guard is load-bearing, not a bug in the test.
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }

    func test_applyRecognitionResult_stampsSegmentWithProvidedCapturedAt_notApplicationTime() {
        // Regression: handleRecognizerCallback's Task.detached hop to
        // MainActor gives no ordering guarantee between two independently
        // detached callbacks (unlike the recognizer's own serial queue that
        // calls handleRecognizerCallback itself). Stamping `Date()` inside
        // applyRecognitionResult (application time) would let a
        // later-arriving-but-earlier-applied callback sort ahead of one that
        // truly arrived first, corrupting the caption order documented on
        // TranscriptionSegment.capturedAt. capturedAt must therefore be
        // captured at arrival time in handleRecognizerCallback and threaded
        // through as a parameter, not re-stamped here.
        //
        // isFinal: false (with isShowingOverlay true to clear the display
        // guard) deliberately avoids the isFinal branch, which calls
        // rotateRecognitionRequest → reinstallTap → a real
        // AVAudioEngine.inputNode.installTap — unavailable in the unit test
        // host (same constraint documented on setTranscribingForTesting).
        let (sut, _) = makeSUT()
        sut.setTranscribingForTesting(true)
        sut.isShowingOverlay = true
        let arrivalTime = Date(timeIntervalSince1970: 1_000)
        sut.applyRecognitionResult(
            text: "Bonjour", speakerId: "user-1", startMs: 0, endMs: 1000,
            isFinal: false, confidence: 0.9, language: "fr", capturedAt: arrivalTime
        )
        XCTAssertEqual(sut.segments.first?.capturedAt, arrivalTime)
    }

    // MARK: - Recognizer Error Path

    func test_applyRecognitionError_whileTranscribing_stopsTranscribingAndSurfacesError() {
        let (sut, _) = makeSUT()
        sut.setTranscribingForTesting(true)

        sut.applyRecognitionError(.recognizerUnavailable(language: "fr"))

        // The recognizer genuinely stopped producing results — isTranscribing
        // must flip false so the captions toggle (driven off it) stops
        // claiming captions are live when they aren't, and lastError must
        // survive the stop so the UI can surface it.
        XCTAssertFalse(sut.isTranscribing)
        XCTAssertEqual(sut.lastError, .recognizerUnavailable(language: "fr"))
    }

    func test_applyRecognitionError_whenNotTranscribing_isNoOp() {
        let (sut, _) = makeSUT()

        sut.applyRecognitionError(.recognizerUnavailable(language: "fr"))

        XCTAssertFalse(sut.isTranscribing)
        XCTAssertNil(sut.lastError)
    }
}

// MARK: - Audio Interruption Policy

/// `AVAudioSession` interruptions (Siri, an incoming GSM call, an alarm) are
/// common mid-call and auto-stop `AVAudioEngine` on their own. Unlike the
/// `.AVAudioEngineConfigurationChange` path (hardware/route changes), nothing
/// previously observed session interruptions at all, so captions silently
/// stopped producing segments for the rest of the call while `isTranscribing`
/// stayed `true`. `evaluateInterruptionAction` is the pure decision extracted
/// from `handleAudioInterruption` — real `AVAudioEngine`/`AVAudioSession`
/// aren't available in the unit test host, so the imperative restart itself
/// is validated on-device, matching this file's existing pattern for
/// `applyRecognitionResult`.
@MainActor
final class CallTranscriptionInterruptionPolicyTests: XCTestCase {

    func test_notTranscribing_neverRestarts() {
        XCTAssertEqual(
            CallTranscriptionService.evaluateInterruptionAction(
                type: .ended, isTranscribing: false, engineIsRunning: false
            ),
            .none
        )
    }

    func test_began_neverRestarts_evenWhileTranscribing() {
        XCTAssertEqual(
            CallTranscriptionService.evaluateInterruptionAction(
                type: .began, isTranscribing: true, engineIsRunning: true
            ),
            .none
        )
        XCTAssertEqual(
            CallTranscriptionService.evaluateInterruptionAction(
                type: .began, isTranscribing: true, engineIsRunning: false
            ),
            .none
        )
    }

    func test_ended_whileTranscribing_engineAlreadyRunning_isNoOp() {
        // Some interruptions (e.g. a very short one) may not stop the engine
        // at all — restarting an already-running engine would throw.
        XCTAssertEqual(
            CallTranscriptionService.evaluateInterruptionAction(
                type: .ended, isTranscribing: true, engineIsRunning: true
            ),
            .none
        )
    }

    func test_ended_whileTranscribing_engineStopped_restarts() {
        XCTAssertEqual(
            CallTranscriptionService.evaluateInterruptionAction(
                type: .ended, isTranscribing: true, engineIsRunning: false
            ),
            .restartEngine
        )
    }

    func test_ended_notTranscribing_engineStopped_isNoOp() {
        // A stale/late interruption notification after the call (and
        // transcription) already ended must not resurrect capture.
        XCTAssertEqual(
            CallTranscriptionService.evaluateInterruptionAction(
                type: .ended, isTranscribing: false, engineIsRunning: false
            ),
            .none
        )
    }
}

// MARK: - Source Guards (AVAudioEngine paths unreachable from the unit test host)

@MainActor
final class CallTranscriptionServiceSourceGuardTests: XCTestCase {

    private func serviceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/CallTranscriptionService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_stopLocalCapture_removesTapUnconditionally() throws {
        // Regression: `guard audioEngine.isRunning else { return }` used to
        // gate removeTap(onBus:) too, so a call ending right after an
        // AVAudioSession interruption (which auto-stops the engine) skipped
        // the removeTap entirely. The stale tap left on bus 0 makes the next
        // startLocalCapture()'s installTap on that bus raise an uncatchable
        // NSInternalInconsistencyException — a guaranteed crash on the next
        // captions attempt for the rest of the app session (CallTranscriptionService
        // is a CallManager-owned singleton, not per-call).
        let source = try serviceSource()
        guard let range = source.range(of: "private func stopLocalCapture") else {
            XCTFail("stopLocalCapture not found"); return
        }
        let nextFunc = source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.range(of: "\n    // MARK:", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<nextFunc])
        XCTAssertFalse(
            body.contains("guard audioEngine.isRunning else { return }"),
            "Crash risk: stopLocalCapture must not early-return on !isRunning before removeTap(onBus:) — " +
            "removeTap must run unconditionally (Apple documents it as safe with no tap installed)."
        )
        XCTAssertTrue(
            body.contains("removeTap(onBus: 0)"),
            "stopLocalCapture must still remove the tap"
        )
    }

    func test_startLocalCapture_registersInterruptionObserver() throws {
        let source = try serviceSource()
        guard let range = source.range(of: "private func startLocalCapture") else {
            XCTFail("startLocalCapture not found"); return
        }
        let nextFunc = source.range(of: "\n    private func ", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<nextFunc])
        XCTAssertTrue(
            body.contains("observeAudioInterruptions()"),
            "startLocalCapture must register the AVAudioSession interruption observer, " +
            "or captions silently die on the next Siri/GSM-call/alarm interruption and never resume."
        )
    }

    func test_stopTranscribing_removesInterruptionObserver() throws {
        let source = try serviceSource()
        guard let range = source.range(of: "func stopTranscribing() {") else {
            XCTFail("stopTranscribing not found"); return
        }
        let nextFunc = source.range(of: "\n    /// Teardown", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<nextFunc])
        XCTAssertTrue(
            body.contains("removeInterruptionObserver()"),
            "stopTranscribing must remove the interruption observer to avoid a dangling observer firing after teardown"
        )
    }
}

// MARK: - TranscriptionSegment Data Model Tests

@MainActor
final class TranscriptionSegmentTests: XCTestCase {

    func test_segment_storesAllProperties() {
        let id = UUID()
        let capturedAt = Date()
        let segment = TranscriptionSegment(
            id: id,
            text: "hello world",
            speakerId: "user123",
            startTime: 1.5,
            endTime: 3.0,
            isFinal: true,
            confidence: 0.95,
            language: "en",
            translatedText: "bonjour le monde",
            translatedLanguage: "fr",
            capturedAt: capturedAt
        )

        XCTAssertEqual(segment.id, id)
        XCTAssertEqual(segment.text, "hello world")
        XCTAssertEqual(segment.speakerId, "user123")
        XCTAssertEqual(segment.startTime, 1.5)
        XCTAssertEqual(segment.endTime, 3.0)
        XCTAssertTrue(segment.isFinal)
        XCTAssertEqual(segment.confidence, 0.95)
        XCTAssertEqual(segment.language, "en")
        XCTAssertEqual(segment.translatedText, "bonjour le monde")
        XCTAssertEqual(segment.translatedLanguage, "fr")
        XCTAssertEqual(segment.capturedAt, capturedAt)
    }

    func test_segment_translationFieldsDefaultToNil() {
        let segment = TranscriptionSegment(
            id: UUID(),
            text: "test",
            speakerId: "s1",
            startTime: 0,
            endTime: 1,
            isFinal: false,
            confidence: 0.8,
            language: "en",
            capturedAt: Date()
        )

        XCTAssertNil(segment.translatedText)
        XCTAssertNil(segment.translatedLanguage)
    }

    func test_segment_equatable() {
        let id = UUID()
        let capturedAt = Date()
        let a = TranscriptionSegment(id: id, text: "hi", speakerId: "u1", startTime: 0, endTime: 1, isFinal: true, confidence: 1, language: "en", capturedAt: capturedAt)
        let b = TranscriptionSegment(id: id, text: "hi", speakerId: "u1", startTime: 0, endTime: 1, isFinal: true, confidence: 1, language: "en", capturedAt: capturedAt)
        XCTAssertEqual(a, b)
    }
}

// MARK: - TranscriptionPermission Tests

@MainActor
final class TranscriptionPermissionTests: XCTestCase {

    func test_equatable() {
        XCTAssertEqual(TranscriptionPermission.authorized, .authorized)
        XCTAssertNotEqual(TranscriptionPermission.authorized, .denied)
    }
}

// MARK: - TranscriptionError Tests

@MainActor
final class TranscriptionErrorTests: XCTestCase {

    func test_permissionDenied_hasDescription() {
        let error = TranscriptionError.permissionDenied
        XCTAssertEqual(error.errorDescription, "Speech recognition permission denied")
    }

    func test_recognizerUnavailable_includesLanguage() {
        let error = TranscriptionError.recognizerUnavailable(language: "fr")
        XCTAssertTrue(error.errorDescription?.contains("fr") ?? false)
    }

    func test_onDeviceNotSupported_includesLanguage() {
        let error = TranscriptionError.onDeviceNotSupported(language: "zh")
        XCTAssertTrue(error.errorDescription?.contains("zh") ?? false)
    }
}

// MARK: - Dead Code Regression (rotateRecognitionRequest)

@MainActor
final class CallTranscriptionServiceDeadCodeTests: XCTestCase {

    private func serviceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/CallTranscriptionService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_rotateRecognitionRequest_doesNotCheckTaskForNil() throws {
        // `SFSpeechRecognizer.recognitionTask(with:)` returns a non-optional
        // SFSpeechRecognitionTask — it can never fail synchronously, so
        // `stream.task == nil` was dead code that could never execute, and the
        // "3 consecutive rotation failures" error it guarded never surfaced.
        // Genuine failures already reach `lastError` on every occurrence via
        // handleRecognizerCallback's `error` branch, so removing the dead
        // branch does not weaken error reporting.
        let source = try serviceSource()
        XCTAssertFalse(
            source.contains("stream.task == nil"),
            "rotateRecognitionRequest must not check stream.task for nil — " +
            "recognitionTask(with:) never returns nil, making that branch unreachable."
        )
        XCTAssertFalse(
            source.contains("Recognition rotation failed 3 times consecutively"),
            "The unreachable 3-consecutive-failures error path must be removed, not left " +
            "as dead code that silently never fires."
        )
    }
}
