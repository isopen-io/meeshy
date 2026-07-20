import XCTest
@testable import Meeshy

@MainActor
final class CallDetailRoutingTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_bubbleCallNoticeView_stillHasHighPriorityGesture_butNoLongerPresentsLocalSheet() throws {
        let view = try source("Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        XCTAssertTrue(
            view.contains(".highPriorityGesture("),
            "The 2026-07-03 pocket-dial fix must survive — removing it would let a long-press " +
            "also fire the card's own Button { onCallBack } tap action."
        )
        XCTAssertFalse(
            view.contains("showDetails = true"),
            "BubbleCallNoticeView must no longer present its own local CallSummaryDetailSheet — " +
            "the long-press now routes through onLongPress to the shared decision point."
        )
    }

    func test_conversationView_onLongPress_branchesOnCallSummary_notMessageSourceSystem() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let range = view.range(of: "onLongPress: { messageId in") else {
            XCTFail("ConversationView must define the onLongPress closure"); return
        }
        let end = view.index(range.lowerBound, offsetBy: 700, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("msg.callSummary != nil"),
            "onLongPress must route call messages via callSummary != nil, not the old blanket " +
            "messageSource == .system no-op — plain system notices (no callSummary) still no-op."
        )
        XCTAssertTrue(
            body.contains("overlayState.callDetailMessage = msg"),
            "A call message's long-press must populate overlayState.callDetailMessage — a new, " +
            "separate property from detailSheetMessage (which stays wired to MessageMoreSheet)."
        )
    }
}
