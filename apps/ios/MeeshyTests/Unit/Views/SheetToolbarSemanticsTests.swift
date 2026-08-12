import XCTest
@testable import Meeshy

/// A sheet's two bar buttons are not "the left one" and "the right one" — they are a
/// *cancellation* and a *confirmation*. Expressing them as `.cancellationAction` /
/// `.confirmationAction` instead of `.navigationBarLeading` / `.navigationBarTrailing`
/// hands the sides back to the system, which is what makes the pair mirror correctly in
/// a right-to-left locale, lets the platform bind Escape / Return to them, and gives the
/// commit its native prominence. The raw bar placements are additionally deprecated
/// since iOS 17 in favour of `.topBarLeading` / `.topBarTrailing`.
///
/// These are source-level assertions: they read the SwiftUI sources rather than render
/// them, which is what lets them run without a simulator and pin cross-file consistency.
@MainActor
final class SheetToolbarSemanticsTests: XCTestCase {

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

    private static let deprecatedPlacements = [
        "placement: .navigationBarLeading",
        "placement: .navigationBarTrailing",
    ]

    private func readSource(_ path: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
    }

    // MARK: - Migrated in 221i

    func test_statusComposer_usesSemanticToolbarPlacements() throws {
        let source = try readSource("Meeshy/Features/Main/Views/StatusComposerView.swift")

        XCTAssertTrue(
            source.contains("ToolbarItem(placement: .cancellationAction)"),
            "The composer's dismiss must be declared as a cancellation, not as a bar side."
        )
        XCTAssertTrue(
            source.contains("ToolbarItem(placement: .confirmationAction)"),
            "The composer's publish must be declared as a confirmation, not as a bar side."
        )
        for placement in Self.deprecatedPlacements {
            XCTAssertFalse(
                source.contains(placement),
                "StatusComposerView must not pin its toolbar to \(placement)."
            )
        }
    }

    /// The migration is a consistency fix, not an invention: `EditPostSheet` is the
    /// structurally identical composer sheet (cancel + a publish button that swaps in a
    /// `ProgressView` while saving) and already ships this pair. If that sibling ever
    /// regresses, the doctrine this iteration mirrored is gone and so is its rationale.
    func test_editPostSheet_remainsTheReferenceComposerSheet() throws {
        let source = try readSource("Meeshy/Features/Main/Components/EditPostSheet.swift")

        XCTAssertTrue(source.contains("ToolbarItem(placement: .cancellationAction)"))
        XCTAssertTrue(source.contains("ToolbarItem(placement: .confirmationAction)"))
    }

    // MARK: - Remaining debt is pinned, not merely tolerated

    /// Unlike the `NavigationView` sweep, this debt is not yet zero. Ten screens still
    /// pin a toolbar item to a bar side; each needs its own judgement call (a *pushed*
    /// view's trailing item is often genuinely a bar item and not a confirmation, so a
    /// blanket rewrite would be wrong). Pinning the exact set keeps the remaining work
    /// visible and stops it from growing.
    func test_deprecatedBarPlacementsDoNotSpread() throws {
        var offenders: Set<String> = []
        for target in scannedTargets {
            let root = iosRoot.appendingPathComponent(target)
            guard let walker = FileManager.default.enumerator(atPath: root.path) else { continue }
            for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
                let source = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
                if Self.deprecatedPlacements.contains(where: { source.contains($0) }) {
                    offenders.insert((relativePath as NSString).lastPathComponent)
                }
            }
        }

        let expected: Set<String> = [
            "AudioPostComposerView.swift",
            "CreateShareLinkView.swift",
            "CreateTrackingLinkView.swift",
            "EmojiPickerSheet.swift",
            "InviteFriendsSheet.swift",
            "MagicLinkView.swift",
            "MyStoriesView.swift",
            "SecurityVerificationView.swift",
            "StoryViewerView+Content.swift",
            "VoiceProfileManageView.swift",
        ]
        XCTAssertEqual(
            offenders, expected,
            "The set of screens pinning a toolbar item to a deprecated bar side changed. If one was " +
            "migrated to .cancellationAction / .confirmationAction, shrink this expectation; if a new " +
            "one appeared, prefer the semantic placement instead."
        )
        XCTAssertFalse(
            offenders.contains("StatusComposerView.swift"),
            "StatusComposerView was migrated in 221i and must not regress."
        )
    }
}
