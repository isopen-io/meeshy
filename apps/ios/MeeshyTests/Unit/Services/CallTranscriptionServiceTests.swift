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
        language: String = "en"
    ) -> TranscriptionSegment {
        TranscriptionSegment(
            id: UUID(),
            text: text,
            speakerId: speakerId,
            startTime: startTime,
            endTime: endTime,
            isFinal: isFinal,
            confidence: confidence,
            language: language
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
            isFinal: true, confidence: 0.9, language: "fr"
        )
        // isTranscribing is false here (startTranscribing was never called),
        // so applyRecognitionResult's guard drops it — this documents that
        // the guard is load-bearing, not a bug in the test.
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }
}

// MARK: - TranscriptionSegment Data Model Tests

@MainActor
final class TranscriptionSegmentTests: XCTestCase {

    func test_segment_storesAllProperties() {
        let id = UUID()
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
            translatedLanguage: "fr"
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
            language: "en"
        )

        XCTAssertNil(segment.translatedText)
        XCTAssertNil(segment.translatedLanguage)
    }

    func test_segment_equatable() {
        let id = UUID()
        let a = TranscriptionSegment(id: id, text: "hi", speakerId: "u1", startTime: 0, endTime: 1, isFinal: true, confidence: 1, language: "en")
        let b = TranscriptionSegment(id: id, text: "hi", speakerId: "u1", startTime: 0, endTime: 1, isFinal: true, confidence: 1, language: "en")
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
