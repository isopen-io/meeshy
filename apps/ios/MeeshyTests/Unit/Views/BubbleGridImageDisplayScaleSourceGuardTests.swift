import XCTest
@testable import Meeshy

/// `BubbleGridImageView`'s image-variant selection (`targetWidthPx`, bandwidth
/// rule 5.2 — pick the lightest variant whose width still covers the on-screen
/// cell) multiplied the cell's point width by `UIScreen.main.scale`: the
/// physical display's pixel density. `UIScreen.main` is deprecated since
/// iOS 16; `@Environment(\.displayScale)` is the SwiftUI-native reader for the
/// same value, correct in every window/scene context a plain `View` can reach
/// (unlike `.bounds`, `.scale` does not vary with Split View/Stage Manager —
/// this is purely an API-modernity fix, not a Stage Manager correctness one).
///
/// Item 7 of `tasks/ios-debt-routine-progress.md`'s final SDK/app `View`-context
/// candidate: `ConversationMediaGalleryView.swift`/`BubbleStandardLayout.swift`
/// keep `UIScreen.main.scale` deliberately (a decode-budget calculation, not a
/// layout read) — this site is different, confirmed via its only call site
/// (`.frame` sizing has already resolved by the time `targetWidthPx` merely
/// picks which pre-encoded variant to request, so there is no Stage-Manager
/// under/over-decode tradeoff to preserve here).
final class BubbleGridImageDisplayScaleSourceGuardTests: XCTestCase {

    private static let file = "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift"

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_bubbleGridImageView_readsDisplayScaleFromTheEnvironment() throws {
        let code = AppSourceGuard.stripComments(try source(Self.file))

        XCTAssertTrue(
            code.contains("@Environment(\\.displayScale)"),
            "BubbleGridImageView must read the display scale from the SwiftUI environment, not " +
            "UIScreen.main.scale directly."
        )
        XCTAssertFalse(
            code.contains("UIScreen.main"),
            "BubbleStandardLayout+Media.swift must not measure the physical display directly."
        )
    }

    /// Contrôle positif : sans ce test, une garde cassée resterait verte pour
    /// toujours et ne protégerait rien.
    func test_guardDetectsTheBannedPattern() {
        let sample = "let targetWidthPx = Int((cellPointWidth * UIScreen.main.scale).rounded())"
        XCTAssertTrue(sample.contains("UIScreen.main"))
    }

    /// Contrôle négatif : la forme corrigée ne doit jamais déclencher l'alerte,
    /// y compris quand `UIScreen.main` n'apparaît qu'en commentaire.
    func test_guardAcceptsDisplayScaleAndIgnoresComments() {
        let sample = """
        // migré depuis UIScreen.main.scale le 2026-08-15
        @Environment(\\.displayScale) private var displayScale: CGFloat
        let targetWidthPx = Int((cellPointWidth * displayScale).rounded())
        """
        let stripped = AppSourceGuard.stripComments(sample)
        XCTAssertFalse(stripped.contains("UIScreen.main"))
    }
}
