import XCTest
import MeeshySDK
@testable import Meeshy

/// #8072 — la carte de note d'après-appel : demandée par échantillon, un
/// toucher pour 4 ou 5 étoiles, les motifs en dessous, « Plus tard » ne
/// renvoie rien. La note part par `call:quality-feedback`.
@MainActor
final class CallFeedbackViewModelTests: XCTestCase {

    private static let now = Date(timeIntervalSince1970: 2_000_000)

    private func makeSUT(random: Double = 0.05) -> (sut: CallFeedbackViewModel, service: MockCallFeedbackService) {
        let service = MockCallFeedbackService()
        let sut = CallFeedbackViewModel(service: service, random: { random }, now: { Self.now })
        return (sut, service)
    }

    private func endCall(
        _ sut: CallFeedbackViewModel,
        callId: String? = "call-1",
        duration: TimeInterval = 90,
        reason: CallEndReason = .local,
        isVideo: Bool = false
    ) {
        sut.callEnded(callId: callId, peerName: "Amina", duration: duration, reason: reason, isVideo: isVideo)
    }

    func test_callEnded_sampleDrawn_promptsAndRecordsTheDate() {
        let (sut, service) = makeSUT(random: 0.05)
        endCall(sut)
        XCTAssertEqual(sut.prompt, CallFeedbackPrompt(callId: "call-1", peerName: "Amina", isVideo: false))
        XCTAssertEqual(service.lastRecordedPromptDate, Self.now)
    }

    func test_callEnded_sampleNotDrawn_staysSilent() {
        let (sut, service) = makeSUT(random: 0.9)
        endCall(sut)
        XCTAssertNil(sut.prompt)
        XCTAssertEqual(service.recordPromptCallCount, 0)
    }

    func test_callEnded_afterTrouble_asksEvenWithoutTheSample() {
        let (sut, _) = makeSUT(random: 0.9)
        sut.callStarted()
        sut.noteTrouble()
        endCall(sut)
        XCTAssertNotNil(sut.prompt)
    }

    func test_callEnded_troubleDoesNotLeakIntoTheNextCall() {
        let (sut, _) = makeSUT(random: 0.9)
        sut.noteTrouble()
        endCall(sut, callId: "call-1", reason: .missed)
        endCall(sut, callId: "call-2")
        XCTAssertNil(sut.prompt)
    }

    func test_callEnded_withinTheDailyCooldown_staysSilent() {
        let (sut, service) = makeSUT(random: 0.05)
        service.lastPromptDateResult = Self.now.addingTimeInterval(-3_600)
        endCall(sut)
        XCTAssertNil(sut.prompt)
    }

    func test_callEnded_withoutCallId_staysSilent() {
        let (sut, _) = makeSUT(random: 0.05)
        endCall(sut, callId: nil)
        XCTAssertNil(sut.prompt)
    }

    func test_rate_goodRating_sendsInOneTouchAndCloses() {
        let (sut, service) = makeSUT()
        endCall(sut)
        sut.rate(5)
        XCTAssertEqual(service.submitted, [CallQualityFeedback(callId: "call-1", rating: 5, issues: [])])
        XCTAssertNil(sut.prompt)
    }

    func test_rate_lowRating_asksWhatWentWrongBeforeSending() {
        let (sut, service) = makeSUT()
        endCall(sut)
        sut.rate(2)
        XCTAssertEqual(sut.pendingRating, 2)
        XCTAssertEqual(service.submitCallCount, 0)
        XCTAssertNotNil(sut.prompt)
    }

    func test_send_lowRatingWithReasons_emitsThemAndCloses() {
        let (sut, service) = makeSUT()
        endCall(sut, isVideo: true)
        sut.rate(2)
        sut.toggle(.echo)
        sut.toggle(.videoQuality)
        sut.toggle(.echo)
        sut.send()
        XCTAssertEqual(service.submitted, [CallQualityFeedback(callId: "call-1", rating: 2, issues: [.videoQuality])])
        XCTAssertNil(sut.prompt)
    }

    func test_dismiss_sendsNothing() {
        let (sut, service) = makeSUT()
        endCall(sut)
        sut.dismiss()
        XCTAssertNil(sut.prompt)
        XCTAssertEqual(service.submitCallCount, 0)
    }

    func test_expire_untouchedCard_closesWithoutSending() {
        let (sut, service) = makeSUT()
        endCall(sut)
        sut.expire()
        XCTAssertNil(sut.prompt)
        XCTAssertEqual(service.submitCallCount, 0)
    }

    func test_expire_onlyClosesAnUntouchedCard() {
        let (sut, _) = makeSUT()
        endCall(sut)
        sut.rate(1)
        sut.expire()
        XCTAssertNotNil(sut.prompt)
        sut.dismiss()
        endCall(sut, callId: "call-2")
        XCTAssertNil(sut.prompt)
    }

    func test_callStarted_withdrawsAPendingPrompt() {
        let (sut, _) = makeSUT()
        endCall(sut)
        sut.callStarted()
        XCTAssertNil(sut.prompt)
    }

    func test_availableIssues_followTheCallMedia() {
        let (sut, _) = makeSUT()
        endCall(sut, isVideo: false)
        XCTAssertEqual(sut.availableIssues, CallFeedbackPolicy.issues(isVideo: false))
    }
}
