import XCTest
@testable import Meeshy
import MeeshySDK

/// `GlobalSearchView.formatTimeAgo` used to re-forge its own English-only
/// ladder ("now" / "5m" / "2h" / "3d") instead of delegating to the SSOT
/// `RelativeTimeFormatter` — a French-configured user saw English timestamps
/// in global search results. Extracted as a `static func` (pure, no `@State`
/// access) so it's unit-testable without constructing a live view, mirroring
/// the established `StoryViewerView.rollingBackOptimisticComment` pattern.
@MainActor
final class GlobalSearchViewTimeAgoTests: XCTestCase {

    func test_formatTimeAgo_delegatesToRelativeTimeFormatterShortString() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveMinutesAgo = now.addingTimeInterval(-5 * 60)

        XCTAssertEqual(
            GlobalSearchView.formatTimeAgo(fiveMinutesAgo, now: now),
            RelativeTimeFormatter.shortString(for: fiveMinutesAgo, now: now),
            "GlobalSearchView must delegate to RelativeTimeFormatter.shortString, not a hand-rolled ladder"
        )
    }

    /// The exact French catalog values ("5 min", "maintenant") are exhaustively
    /// covered by `RelativeTimeFormatterTests` in the SDK test target, where the
    /// app bundle is absent and `String(localized:)` deterministically falls
    /// back to the French `defaultValue`. This app-hosted target runs against
    /// the real app bundle under the simulator's actual locale (not guaranteed
    /// French), so these assert against the old hand-rolled-ladder strings
    /// ("5m", "now") being absent — the actual regression this suite guards —
    /// rather than a hardcoded language.
    func test_formatTimeAgo_fiveMinutesAgo_isLocalizedNotHardcodedEnglish() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveMinutesAgo = now.addingTimeInterval(-5 * 60)

        XCTAssertEqual(
            GlobalSearchView.formatTimeAgo(fiveMinutesAgo, now: now),
            RelativeTimeFormatter.shortString(for: fiveMinutesAgo, now: now),
            "Must delegate to RelativeTimeFormatter, not the old hardcoded '5m'"
        )
    }

    func test_formatTimeAgo_justNow_isNotHardcodedEnglishNow() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveSecondsAgo = now.addingTimeInterval(-5)

        XCTAssertEqual(
            GlobalSearchView.formatTimeAgo(fiveSecondsAgo, now: now),
            RelativeTimeFormatter.shortString(for: fiveSecondsAgo, now: now),
            "Must delegate to RelativeTimeFormatter, not the old hardcoded 'now'"
        )
    }
}
