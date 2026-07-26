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

    // MARK: - Migrated in 215i

    /// The last holdout, and the most exposed of the four: both of its toolbar
    /// items — the only dismiss (`navigationBarLeading`) and the only publish
    /// action (`navigationBarTrailing`) — sat in a bar the double-column style
    /// could push into the wrong column.
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

    // MARK: - The debt is now closed, and stays closed

    func test_noNavigationViewRemains() throws {
        // 214i left exactly one holdout (StatusComposerView, then held by an
        // in-flight pull request) and pinned it here so it could not be forgotten.
        // 215i migrated it, so the expectation is now the empty set: the app
        // targets are free of the deprecated container, and any reintroduction
        // fails this test by name.
        XCTAssertEqual(
            try filesUsingDeprecatedContainer(), Set<String>(),
            "A NavigationView was reintroduced. Use NavigationStack: the deprecated container " +
            "defaults to the double-column style and collapses to an empty detail pane at regular " +
            "width (iPad), stranding toolbar items in the wrong column."
        )
    }
}
