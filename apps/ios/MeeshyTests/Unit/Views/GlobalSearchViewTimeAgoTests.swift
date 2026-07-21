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

    func test_formatTimeAgo_fiveMinutesAgo_isLocalizedNotHardcodedEnglish() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveMinutesAgo = now.addingTimeInterval(-5 * 60)

        XCTAssertEqual(
            GlobalSearchView.formatTimeAgo(fiveMinutesAgo, now: now),
            "5 min",
            "Must match RelativeTimeFormatter's French default catalog value, not the old hardcoded '5m'"
        )
    }

    func test_formatTimeAgo_justNow_isNotHardcodedEnglishNow() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)

        XCTAssertEqual(
            GlobalSearchView.formatTimeAgo(now.addingTimeInterval(-5), now: now),
            "maintenant",
            "Must match RelativeTimeFormatter's 'maintenant', not the old hardcoded 'now'"
        )
    }
}
