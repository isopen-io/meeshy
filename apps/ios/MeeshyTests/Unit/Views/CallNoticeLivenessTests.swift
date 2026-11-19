import XCTest
import MeeshySDK
@testable import Meeshy

/// #19790 — une carte « en cours » ne propose « Rejoindre » que si le serveur confirme CET appel.
final class CallNoticeLivenessTests: XCTestCase {

    private final class SessionStub: ActiveCallServiceProviding, @unchecked Sendable {
        var session: Result<ActiveCallSession?, Error> = .success(nil)
        private(set) var calls = 0

        func activeCall(conversationId: String) async throws -> ActiveCallSession? { nil }

        func callSession(callId: String) async throws -> ActiveCallSession? {
            calls += 1
            return try session.get()
        }
    }

    private struct Offline: Error {}

    private func summary(live: Bool, duration: Int = 42) -> CallSummaryMetadata {
        CallSummaryMetadata(callId: "c1", initiatorId: "u1", callType: .video, outcome: .completed, durationSeconds: duration, bytesTotal: nil, bytesEstimated: false, networkQuality: nil, isLive: live)
    }

    private func session(id: String = "c1", status: String) -> ActiveCallSession {
        ActiveCallSession(id: id, conversationId: "conv", mode: "video", status: status, participants: [])
    }

    func test_of_activeSessionOfThisCall_confirms() {
        XCTAssertEqual(CallNoticeLiveness.of(session: session(status: "active"), callId: "c1"), .confirmed)
        XCTAssertEqual(CallNoticeLiveness.of(session: session(status: "ringing"), callId: "c1"), .confirmed)
    }

    func test_of_terminalMissingOrOtherCall_isEnded() {
        for status in ["ended", "missed", "rejected", "failed"] {
            XCTAssertEqual(CallNoticeLiveness.of(session: session(status: status), callId: "c1"), .ended, status)
        }
        XCTAssertEqual(CallNoticeLiveness.of(session: nil, callId: "c1"), .ended)
        XCTAssertEqual(CallNoticeLiveness.of(session: session(id: "c2", status: "active"), callId: "c1"), .ended)
    }

    func test_presented_liveCardIsLiveOnlyOnceConfirmed() {
        XCTAssertTrue(CallNoticeLiveness.presented(summary(live: true), liveness: .confirmed).isLive)
        XCTAssertFalse(CallNoticeLiveness.presented(summary(live: true), liveness: .unverified).isLive)
        XCTAssertFalse(CallNoticeLiveness.presented(summary(live: true), liveness: .ended).isLive)
    }

    func test_presented_staleLiveCard_carriesNoPlaceholderDuration() {
        XCTAssertEqual(CallNoticeLiveness.presented(summary(live: true), liveness: .ended).durationSeconds, 0)
    }

    func test_presented_terminalSummary_isUntouched() {
        let ended = summary(live: false)
        XCTAssertEqual(CallNoticeLiveness.presented(ended, liveness: .ended), ended)
        XCTAssertEqual(CallNoticeLiveness.presented(ended, liveness: .unverified), ended)
    }

    func test_checker_rememberesAnEndedCall_andAsksOnlyOnce() async {
        let stub = SessionStub()
        stub.session = .success(session(status: "ended"))
        let checker = CallNoticeLivenessChecker(service: stub)
        let first = await checker.liveness(callId: "c1")
        let second = await checker.liveness(callId: "c1")
        XCTAssertEqual(first, .ended)
        XCTAssertEqual(second, .ended)
        XCTAssertEqual(stub.calls, 1)
    }

    func test_checker_liveCallIsAskedAgain_soItsEndIsSeen() async {
        let stub = SessionStub()
        stub.session = .success(session(status: "active"))
        let checker = CallNoticeLivenessChecker(service: stub)
        let live = await checker.liveness(callId: "c1")
        XCTAssertEqual(live, .confirmed)
        stub.session = .success(nil)
        let ended = await checker.liveness(callId: "c1")
        XCTAssertEqual(ended, .ended)
    }

    func test_checker_networkFailure_staysUnverified_withoutVerdict() async {
        let stub = SessionStub()
        stub.session = .failure(Offline())
        let checker = CallNoticeLivenessChecker(service: stub)
        let offline = await checker.liveness(callId: "c1")
        XCTAssertEqual(offline, .unverified)
        stub.session = .success(session(status: "active"))
        let back = await checker.liveness(callId: "c1")
        XCTAssertEqual(back, .confirmed)
    }

    func test_checker_markEnded_skipsTheServer() async {
        let stub = SessionStub()
        let checker = CallNoticeLivenessChecker(service: stub)
        await checker.markEnded(callId: "c1")
        let verdict = await checker.liveness(callId: "c1")
        XCTAssertEqual(verdict, .ended)
        XCTAssertEqual(stub.calls, 0)
    }

    func test_bubble_readsTheConfirmedSummary_andAsksTheServerForLiveCards() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift"))
        XCTAssertTrue(view.contains("CallNoticeLiveness.presented(notice.summary, liveness: liveness)"))
        XCTAssertTrue(view.contains("CallNoticeLivenessChecker.shared.liveness(callId:"))
    }

    func test_joiner_rememberesAnEndedCall() throws {
        let joiner = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Services/LiveCallJoiner.swift"))
        XCTAssertTrue(joiner.contains("CallNoticeLivenessChecker.shared.markEnded(callId: request.callId)"))
    }
}
