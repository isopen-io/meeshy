import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// `ConversationView.unreadCallIndicator(for:)` maps the last unread
/// message's `CallSummaryMetadata` to the scroll-to-bottom pill's SF Symbol +
/// hex tint. Reads `isLive` BEFORE `outcome` (a live message's outcome is a
/// neutral placeholder) and keeps "annulé" on the same error hex as "manqué"
/// — mirrors `CallNoticePresentation` (`BubbleCallNoticeView.swift`), the
/// SSOT for call vocabulary, without re-decoding `message.metadata`.
@MainActor
final class ConversationScrollControlsCallIndicatorTests: XCTestCase {

    func test_noCallSummary_returnsNilSymbolAndTint() {
        let result = ConversationView.unreadCallIndicator(for: nil)

        XCTAssertNil(result.symbol)
        XCTAssertNil(result.tint)
    }

    func test_liveAudioCall_returnsPhoneGlyphAndNilTint() {
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "phone.fill")
        XCTAssertNil(result.tint, "la pastille est déjà teintée accent — le glyphe retombe sur contentColor")
    }

    func test_liveVideoCall_returnsVideoGlyph() {
        let summary = makeSummary(callType: .video, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "video.fill")
    }

    func test_liveCall_readsIsLiveBeforeOutcome_evenWithCompletedPlaceholder() {
        // Un message vivant porte outcome:.completed comme placeholder neutre —
        // isLive doit gagner, jamais retomber sur la branche "abouti" (nil/nil).
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: true)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertNotNil(result.symbol)
    }

    func test_missedCall_returnsErrorHex() {
        let summary = makeSummary(callType: .audio, outcome: .missed)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "phone.fill")
        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_rejectedCall_returnsErrorHex() {
        let summary = makeSummary(callType: .video, outcome: .rejected)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.symbol, "video.fill")
        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_cancelledCall_missedEndedByInitiator_staysOnErrorHex_sameFamilyAsMissed() {
        let summary = CallSummaryMetadata(
            callId: "call1", initiatorId: "u1", callType: .audio, outcome: .missed,
            durationSeconds: 0, bytesTotal: nil, bytesEstimated: false, networkQuality: nil,
            endedByInitiator: true
        )

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_failedCall_returnsWarningHex_notError() {
        let summary = makeSummary(callType: .audio, outcome: .failed)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertEqual(result.tint, MeeshyColors.warningHex)
        XCTAssertNotEqual(result.tint, MeeshyColors.errorHex)
    }

    func test_completedCall_returnsNilSymbolAndTint_noPendingActionToFlag() {
        let summary = makeSummary(callType: .audio, outcome: .completed, isLive: false)

        let result = ConversationView.unreadCallIndicator(for: summary)

        XCTAssertNil(result.symbol)
        XCTAssertNil(result.tint)
    }

    private func makeSummary(
        callType: CallSummaryMetadata.MediaType,
        outcome: CallSummaryMetadata.Outcome,
        isLive: Bool = false
    ) -> CallSummaryMetadata {
        CallSummaryMetadata(
            callId: "call1",
            initiatorId: "peer",
            callType: callType,
            outcome: outcome,
            durationSeconds: 30,
            bytesTotal: 100_000,
            bytesEstimated: false,
            networkQuality: .good,
            isLive: isLive
        )
    }
}
