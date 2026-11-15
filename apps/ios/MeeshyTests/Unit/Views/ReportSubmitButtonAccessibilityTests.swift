import XCTest
@testable import Meeshy

/// A `Button` whose label is `if isBusy { ProgressView() } else { Text(…) }` has
/// **no accessible name at all** while it is busy: the only `Text` is in the
/// branch that is not rendered. `MeeshyComposerHost.publishButton` states the doctrine —
/// *pin the name to the action and carry transient state as value* — and 12 of
/// the app's 19 such buttons already follow it.
///
/// The two report-submission buttons did not, and they are the worst place for
/// it: reporting is destructive and socially irreversible, and one of the two is
/// a **toolbar** control, the hardest kind to identify by touch exploration.
@MainActor
final class ReportSubmitButtonAccessibilityTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Source with comment lines stripped: the doc-comments below name the very
    /// modifiers under test, so a raw `contains` would pass on prose alone.
    private func code(_ path: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private static let detailView = "Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift"
    private static let sheet = "Meeshy/Features/Main/Components/ReportMessageSheet.swift"

    // MARK: - The name survives the busy state

    func test_detailSubmitButton_keepsItsNameWhileSubmitting() throws {
        let code = try code(Self.detailView)
        XCTAssertTrue(
            code.contains(".accessibilityLabel(String(localized: \"message-detail.report.send\""),
            "The submit button must carry an explicit name so it is not anonymous while its "
            + "label is a bare ProgressView."
        )
    }

    func test_sheetSubmitButton_keepsItsNameWhileSubmitting() throws {
        let code = try code(Self.sheet)
        XCTAssertTrue(
            code.contains(".accessibilityLabel(String(localized: \"report.message.send\""),
            "The toolbar submit button must carry an explicit name — a nameless toolbar control "
            + "cannot be identified by touch exploration."
        )
    }

    /// The name must be the **visible** string, not a new one: reusing each
    /// screen's own key keeps voice and screen identical and adds no i18n key
    /// (the catalogue is being rewritten concurrently, so introducing one here
    /// would both collide and move the untranslated-backlog ratchet).
    func test_names_reuseTheVisibleKeys_andAddNoNewKey() throws {
        for (path, key) in [(Self.detailView, "message-detail.report.send"),
                            (Self.sheet, "report.message.send")] {
            let code = try code(path)
            XCTAssertEqual(
                code.components(separatedBy: key).count - 1, 2,
                "\(key) must appear exactly twice in \(path): once rendering the button, once "
                + "naming it. A third occurrence or a new key would mean the strings diverged."
            )
        }
        for (path, minted) in [(Self.detailView, "a11y.message-detail.report"),
                               (Self.sheet, "a11y.report.message")] {
            XCTAssertFalse(
                try code(path).contains(minted),
                "No screen-specific a11y key should be minted for a string that already exists."
            )
        }
    }

    /// Guard on the shape itself: if a future edit gives the busy branch its own
    /// `Text`, the button is no longer anonymous and this suite's premise —
    /// hence its assertions — would need revisiting rather than silently holding.
    func test_busyBranchStillCollapsesToABareProgressView() throws {
        for path in [Self.detailView, Self.sheet] {
            let code = try code(path)
            XCTAssertTrue(
                code.contains("ProgressView()"),
                "\(path) is expected to swap its label for a bare ProgressView while busy; if that "
                + "changed, re-evaluate whether the pinned label is still the right fix."
            )
        }
    }
}
