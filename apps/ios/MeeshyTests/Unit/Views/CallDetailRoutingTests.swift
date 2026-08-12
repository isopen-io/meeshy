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

    /// Extrait le corps d'une closure en équilibrant ses accolades.
    ///
    /// La version précédente coupait à 700 caractères après l'ouverture. Des
    /// commentaires ajoutés en tête de closure ont fini par occuper toute la
    /// fenêtre : le test dénonçait une régression de routage alors que le code
    /// cherché se trouvait juste après la limite. Une closure se délimite par
    /// ses accolades, pas par un nombre de caractères arbitraire.
    private func closureBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            let ch = source[index]
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    func test_conversationView_onLongPress_branchesOnCallSummary_notMessageSourceSystem() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onLongPress: { messageId in", in: view) else {
            XCTFail("ConversationView must define the onLongPress closure"); return
        }
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
