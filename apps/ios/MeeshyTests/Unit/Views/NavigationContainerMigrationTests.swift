import XCTest
@testable import Meeshy

/// `NavigationView` is deprecated since iOS 16 and — critically — defaults to the
/// double-column style. On a regular-width environment (iPad, and the iPad share
/// sheet) a single-child `NavigationView` therefore renders as a split view whose
/// detail column is empty, hiding the sheet's own content and, in the toolbar case,
/// misplacing its only dismiss affordance.
///
/// The app's deployment floor is iOS 16.0 (`project.yml`), so `NavigationStack` is
/// available unconditionally — no availability guard, no compatibility shim.
///
/// This suite sweeps every SwiftUI source of the iOS app targets and pins the exact
/// set of files still using the deprecated container, so that (a) the migrated files
/// cannot regress and (b) no new `NavigationView` can be introduced unnoticed.
@MainActor
final class NavigationContainerMigrationTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Source trees compiled into the shipping iOS app targets.
    private let scannedTargets = ["Meeshy", "MeeshyShareExtension", "MeeshyNotificationExtension"]

    /// Files still declaring a `NavigationView { … }` container, by file name.
    private func filesUsingDeprecatedContainer() throws -> Set<String> {
        var offenders: Set<String> = []
        for target in scannedTargets {
            let root = iosRoot.appendingPathComponent(target)
            guard let walker = FileManager.default.enumerator(atPath: root.path) else { continue }
            for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
                let source = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
                // `NavigationViewStyle` / `.navigationViewStyle` are distinct APIs — match the container only.
                if source.contains("NavigationView {") {
                    offenders.insert((relativePath as NSString).lastPathComponent)
                }
            }
        }
        return offenders
    }

    // MARK: - Migrated in 214i

    func test_emojiPickerSheet_usesNavigationStack() throws {
        try assertMigrated("Meeshy/Features/Main/Views/EmojiPickerSheet.swift")
    }

    func test_voiceProfileAddSamplesSheet_usesNavigationStack() throws {
        try assertMigrated("Meeshy/Features/Main/Views/VoiceProfileManageView.swift")
    }

    func test_shareExtensionContactPicker_usesNavigationStack() throws {
        try assertMigrated("MeeshyShareExtension/ShareViewController.swift")
    }

    // MARK: - Migrated in 219i

    /// The last holdout. It is presented as a `.sheet` from all three of its call
    /// sites (`RootViewComponents`, and twice from `ConversationListView`), which
    /// on iPad is a form sheet — regular width, the exact environment where
    /// `NavigationView`'s default double-column style collapses to an empty
    /// detail pane. Both of the composer's actions (Cancel, leading; Publish,
    /// trailing) live in that toolbar, so the misplacement hit every way out of
    /// the screen.
    func test_statusComposer_usesNavigationStack() throws {
        try assertMigrated("Meeshy/Features/Main/Views/StatusComposerView.swift")
    }

    private func assertMigrated(_ path: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let source = try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
        XCTAssertFalse(
            source.contains("NavigationView {"),
            "\(path) must not use the deprecated NavigationView container: with its default " +
            "double-column style it collapses to an empty detail pane at regular width (iPad).",
            file: file, line: line
        )
        XCTAssertTrue(
            source.contains("NavigationStack {"),
            "\(path) must host its content in a NavigationStack (available unconditionally at the " +
            "iOS 16.0 deployment floor).",
            file: file, line: line
        )
    }

    // MARK: - The debt is closed, and stays closed

    /// 214i pinned the remaining debt to `{StatusComposerView.swift}` and wrote
    /// that the expectation "drops to the empty set and the test fails until it is
    /// updated — which is the intent". 219i migrated that last holdout, so the set
    /// is now empty and this assertion changes role: it stops tracking a shrinking
    /// backlog and becomes a plain ratchet against reintroducing the deprecated
    /// container anywhere in the app targets.
    func test_noNavigationViewRemains() throws {
        XCTAssertEqual(
            try filesUsingDeprecatedContainer(), [],
            "NavigationView is deprecated since iOS 16 and its default double-column style " +
            "collapses to an empty detail pane at regular width. The app targets are fully " +
            "migrated — use NavigationStack, which is available unconditionally at the iOS 16.0 " +
            "deployment floor."
        )
    }
}
