import XCTest
@testable import Meeshy

@MainActor
final class CallSummaryTranscriptSectionTests: XCTestCase {

    private func source(_ path: String = "Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift") throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func sectionSource() throws -> String {
        try source("Meeshy/Features/Main/Views/CallTranscriptSection.swift")
    }

    func test_callSummaryDetailSheet_looksUpTranscript_bySummaryCallId() throws {
        let view = try source()
        guard let range = view.range(of: "struct CallSummaryDetailSheet: View {") else {
            XCTFail("CallSummaryDetailSheet not found"); return
        }
        let end = view.index(range.lowerBound, offsetBy: 3000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("CallTranscriptLoader.load(callId: summary.callId)"),
            "The sheet must look up the transcript keyed by the call's own callId."
        )
        XCTAssertTrue(
            try sectionSource().contains("CallTranscriptStore.shared.transcript(for: callId)"),
            "The loader must read the local encrypted cache before the server replay."
        )
    }

    func test_transcriptSection_hasDeleteAction_notOnlyMessageDeletion() throws {
        let view = try sectionSource()
        XCTAssertTrue(
            view.contains("CallTranscriptStore.shared.invalidate(for:"),
            "The detail sheet must offer a direct, discoverable delete action for the transcript " +
            "— independent of deleting the call message itself (privacy review finding)."
        )
    }

    func test_disclaimer_mentionsMeeshyServerNotDevice_andInterlocutorWords() throws {
        let view = try sectionSource()
        XCTAssertTrue(
            view.contains("call.transcript.disclaimer"),
            "The disclaimer string key must exist and be shown alongside the Transcript section."
        )
    }
}
