import XCTest
import MeeshySDK
@testable import Meeshy

/// #8072 — QUAND on demande la note d'après-appel. Même règle que le web
/// (`apps/web/src/lib/calls/call-feedback.ts`, D-139) : un appel qui a
/// vraiment eu lieu (≥ 10 s, raccroché ou perdu), un sur cinq au hasard,
/// toujours celui qui a souffert ; et jamais plus d'une demande par jour.
@MainActor
final class CallFeedbackPolicyTests: XCTestCase {

    private func ask(
        duration: TimeInterval = 120,
        reason: CallEndReason = .local,
        troubled: Bool = false,
        random: Double = 0.9
    ) -> Bool {
        CallFeedbackPolicy.shouldAsk(duration: duration, reason: reason, troubled: troubled, random: random)
    }

    func test_shouldAsk_ordinaryCall_onlyWhenTheSampleIsDrawn() {
        XCTAssertTrue(ask(random: 0.05))
        XCTAssertFalse(ask(random: 0.9))
    }

    func test_shouldAsk_troubledCall_alwaysAsked() {
        XCTAssertTrue(ask(troubled: true, random: 0.99))
    }

    func test_shouldAsk_lostConnection_alwaysAsked() {
        XCTAssertTrue(ask(reason: .connectionLost, random: 0.99))
    }

    func test_shouldAsk_callShorterThanTenSeconds_neverAsked() {
        XCTAssertFalse(ask(duration: CallFeedbackPolicy.minimumDuration - 1, troubled: true, random: 0))
        XCTAssertTrue(ask(duration: CallFeedbackPolicy.minimumDuration, random: 0))
    }

    func test_shouldAsk_callThatNeverHappened_neverAsked() {
        XCTAssertFalse(ask(reason: .missed, random: 0))
        XCTAssertFalse(ask(reason: .rejected, random: 0))
        XCTAssertFalse(ask(reason: .failed("ice"), random: 0))
    }

    func test_shouldAsk_remoteHangUp_askedLikeALocalOne() {
        XCTAssertTrue(ask(reason: .remote, random: 0.05))
    }

    func test_cooldownAllows_firstPrompt_allowed() {
        XCTAssertTrue(CallFeedbackPolicy.cooldownAllows(lastPromptAt: nil, now: Date()))
    }

    func test_cooldownAllows_withinADay_refused_thenAllowed() {
        let last = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertFalse(CallFeedbackPolicy.cooldownAllows(lastPromptAt: last, now: last.addingTimeInterval(CallFeedbackPolicy.cooldown - 1)))
        XCTAssertTrue(CallFeedbackPolicy.cooldownAllows(lastPromptAt: last, now: last.addingTimeInterval(CallFeedbackPolicy.cooldown)))
    }

    func test_cooldownAllows_lastPromptInTheFuture_neverBlocksForever() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(CallFeedbackPolicy.cooldownAllows(lastPromptAt: now.addingTimeInterval(3_600), now: now))
    }

    func test_issues_audioCall_offersNoVideoReason() {
        XCTAssertEqual(CallFeedbackPolicy.issues(isVideo: false), [.audioQuality, .echo, .dropped, .other])
    }

    func test_issues_videoCall_offersFrozenVideoAndSync() {
        XCTAssertEqual(CallFeedbackPolicy.issues(isVideo: true), [.audioQuality, .videoQuality, .echo, .dropped, .sync, .other])
    }

    func test_feedback_goodRating_dropsReasons() {
        XCTAssertEqual(CallFeedbackPolicy.feedback(callId: "c1", rating: 4, issues: [.echo])?.issues, [])
        XCTAssertEqual(CallFeedbackPolicy.feedback(callId: "c1", rating: 2, issues: [.echo])?.issues, [.echo])
    }
}
