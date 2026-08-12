import XCTest
@testable import Meeshy

/// Regression guard for the header's call+search button spacing (user-requested
/// 2026-07-11: "les boutons n'ont pas besoin d'être si loin l'un de l'autre").
/// Each button already carries ~8pt of invisible padding via `.meeshyTapTarget()`'s
/// 44×44 HIG minimum around a visually 28×28 glass circle — an HStack with its own
/// non-zero spacing stacks additional space ON TOP of that built-in padding.
@MainActor
final class ConversationViewHeaderButtonsClusterTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_headerButtonsCluster_usesZeroSpacing() throws {
        let view = try source()
        guard let range = view.range(of: "private var headerButtonsCluster: some View {") else {
            XCTFail("ConversationView must define headerButtonsCluster")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 300, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("HStack(spacing: 0)"),
            "headerButtonsCluster must use zero extra spacing — each button already " +
            "carries its own built-in padding via meeshyTapTarget's 44×44 minimum."
        )
        XCTAssertTrue(
            body.contains("headerCallButtons.layoutPriority(1)") && body.contains("expandedHeaderSearchButton"),
            "headerButtonsCluster must contain both the call button and the search button."
        )
    }

    func test_bothHeaderStates_useHeaderButtonsCluster_notInlineDuplication() throws {
        let view = try source()
        let occurrences = view.components(separatedBy: "headerButtonsCluster").count - 1
        // 1 declaration + 2 call sites (collapsed-header state, expanded-options state).
        XCTAssertEqual(
            occurrences, 3,
            "headerButtonsCluster must be referenced from both header states (collapsed " +
            "and options-expanded) rather than duplicating the HStack(spacing: 0) { ... } " +
            "inline in each — a future spacing tweak must only need one edit."
        )
    }
}
