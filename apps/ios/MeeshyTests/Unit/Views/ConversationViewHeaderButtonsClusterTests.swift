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
        // `AnyView` (not `some View`) since 2026-08-17 — erasing at the
        // DECLARATION (not just call sites) was required to stop a Swift
        // metadata-decoder stack overflow at first render (see
        // ConversationFirstRenderWarmup.swift doc comment).
        guard let range = view.range(of: "private var headerButtonsCluster: AnyView {") else {
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

    /// Arbitrage user 2026-08-18 : la bande DÉPLIÉE ne porte plus la grappe
    /// (ni mode, ni recherche, ni appel — titre + tags seulement). L'unique
    /// site d'appel restant est l'état PLIÉ ; l'invariant anti-duplication
    /// demeure : toute évolution de spacing ne doit exiger qu'une édition.
    func test_collapsedHeaderState_usesHeaderButtonsCluster_notInlineDuplication() throws {
        // Comments stripped: the AnyView-erasure doc comments mention
        // "headerButtonsCluster" by name several times and would otherwise
        // inflate this count (feedback_source_guard_tests_must_strip_comments).
        let view = AppSourceGuard.stripComments(try source())
        let occurrences = view.components(separatedBy: "headerButtonsCluster").count - 1
        // 1 declaration + 1 call site (collapsed-header state only —
        // the options-expanded band carries no action buttons since 2026-08-18).
        XCTAssertEqual(
            occurrences, 2,
            "headerButtonsCluster must be referenced from the collapsed header state only " +
            "(1 declaration + 1 call site) — the expanded band carries no action buttons " +
            "(user 2026-08-18), and the cluster must never be duplicated inline."
        )
    }
}
