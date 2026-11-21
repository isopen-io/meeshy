import XCTest
import MeeshySDK
@testable import Meeshy

/// #19713 — la reconnaissance continue sur l'appareil ne rend presque jamais
/// `isFinal` tant que le micro coule : sans pause détectée, tout ce que dit
/// l'utilisateur restait UNE ligne réécrite. Une pause de parole clôt la phrase,
/// et la suivante ouvre sa propre entrée de journal.
@MainActor
final class CallTranscriptionUtterancePauseTests: XCTestCase {

    private let pause: Duration = .milliseconds(40)

    private func makeSUT() -> (sut: CallTranscriptionService, socket: MockMessageSocket) {
        let socket = MockMessageSocket()
        let sut = CallTranscriptionService(
            socket: socket,
            gateResolver: MockCallCaptionsGateResolver(gate: .open),
            utterancePause: pause
        )
        sut.setCaptionsGateForTesting(.open)
        sut.setTranscribingForTesting(true)
        sut.setCallIdForTesting("call-1")
        return (sut, socket)
    }

    private func speak(_ sut: CallTranscriptionService, _ text: String, at seconds: TimeInterval, generation: Int? = nil) {
        sut.applyRecognitionResult(
            text: text, speakerId: "me", startMs: 0, endMs: 500,
            isFinal: false, confidence: 0.8, language: "fr",
            capturedAt: Date(timeIntervalSince1970: seconds), callId: "call-1",
            generation: generation
        )
    }

    private func waitPastThePause() async throws {
        try await Task.sleep(for: .milliseconds(200))
    }

    func test_pauseAfterASentence_closesItAsAFinalEntry_andSendsItToTheServer() async throws {
        let (sut, socket) = makeSUT()

        speak(sut, "Bonjour à tous", at: 100)
        try await waitPastThePause()

        XCTAssertEqual(sut.segments.count, 1)
        XCTAssertEqual(sut.segments.first?.text, "Bonjour à tous")
        XCTAssertEqual(sut.segments.first?.isFinal, true)
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 1)
        XCTAssertEqual(sut.persistedSegmentsForTesting.count, 1)
    }

    func test_sentenceAfterAPause_opensItsOwnEntry() async throws {
        let (sut, _) = makeSUT()

        speak(sut, "Bonjour à tous", at: 100)
        try await waitPastThePause()
        speak(sut, "On commence", at: 105)

        XCTAssertEqual(sut.segments.map(\.text), ["Bonjour à tous", "On commence"])
        XCTAssertNotEqual(sut.segments.first?.wireId, sut.segments.last?.wireId)
        XCTAssertEqual(sut.segments.last?.isFinal, false)
    }

    func test_revisionsWithoutAPause_stayOnTheSameEntry() {
        let (sut, socket) = makeSUT()

        speak(sut, "Bonj", at: 100)
        speak(sut, "Bonjour", at: 100.3)

        XCTAssertEqual(sut.segments.count, 1)
        XCTAssertEqual(sut.segments.first?.text, "Bonjour")
        XCTAssertEqual(sut.segments.first?.isFinal, false)
        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }

    func test_lateRevisionFromTheReplacedRecognition_isIgnored() async throws {
        let (sut, _) = makeSUT()

        speak(sut, "Bonjour à tous", at: 100, generation: 0)
        try await waitPastThePause()
        speak(sut, "Bonjour à tous et", at: 101, generation: 0)

        XCTAssertEqual(sut.segments.map(\.text), ["Bonjour à tous"])
    }

    func test_errorFromTheReplacedRecognition_keepsCaptionsRunning() async throws {
        let (sut, _) = makeSUT()

        speak(sut, "Bonjour à tous", at: 100, generation: 0)
        try await waitPastThePause()
        sut.applyRecognitionError(.recognizerUnavailable(language: "fr"), callId: "call-1", generation: 0)

        XCTAssertTrue(sut.isTranscribing)
        XCTAssertNil(sut.lastError)
    }

    func test_stoppingCaptureBeforeThePause_sendsNothing() async throws {
        let (sut, socket) = makeSUT()

        speak(sut, "Bonjour", at: 100)
        sut.stopTranscribing()
        try await waitPastThePause()

        XCTAssertEqual(socket.emitCallTranscriptionSegmentCallCount, 0)
    }
}
