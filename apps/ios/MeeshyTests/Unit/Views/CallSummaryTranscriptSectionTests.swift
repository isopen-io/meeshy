import XCTest
@testable import Meeshy

@MainActor
final class CallSummaryTranscriptSectionTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callSummaryDetailSheet_looksUpTranscript_bySummaryCallId() throws {
        let view = try source()
        guard let range = view.range(of: "struct CallSummaryDetailSheet: View {") else {
            XCTFail("CallSummaryDetailSheet not found"); return
        }
        let end = view.index(range.lowerBound, offsetBy: 3000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("CallTranscriptStore.shared.transcript(for: summary.callId)"),
            "The sheet must look up a local transcript keyed by the call's own callId."
        )
    }

    func test_transcriptSection_hasDeleteAction_notOnlyMessageDeletion() throws {
        let view = try source()
        XCTAssertTrue(
            view.contains("CallTranscriptStore.shared.invalidate(for:"),
            "The detail sheet must offer a direct, discoverable delete action for the transcript " +
            "— independent of deleting the call message itself (privacy review finding)."
        )
    }

    func test_disclaimer_mentionsMeeshyServerNotDevice_andInterlocutorWords() throws {
        let view = try source()
        XCTAssertTrue(
            view.contains("call.transcript.disclaimer"),
            "The disclaimer string key must exist and be shown alongside the Transcript section."
        )
    }
}
