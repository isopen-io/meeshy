import XCTest
@testable import Meeshy
import MeeshySDK

/// `ParticipantsView.relativeTime` used to bypass the SSOT `RelativeTimeFormatter`
/// via `Date.formatted(.relative(presentation: .numeric))` — RelativeTimeFormatter's
/// own header comment explicitly lists "participants" among the surfaces it
/// replaced. Extracted as a `static func` (pure, no `@State` access) so it's
/// unit-testable without constructing a live view.
@MainActor
final class ParticipantsViewRelativeTimeTests: XCTestCase {

    func test_relativeTime_delegatesToRelativeTimeFormatterLongString() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveMinutesAgo = now.addingTimeInterval(-5 * 60)

        XCTAssertEqual(
            ParticipantsView.relativeTime(from: fiveMinutesAgo, now: now),
            RelativeTimeFormatter.longString(for: fiveMinutesAgo, now: now),
            "ParticipantsView must delegate to RelativeTimeFormatter.longString, the SSOT for detail surfaces"
        )
    }

    /// The exact `"il y a 5 min"` French frame is exhaustively covered by
    /// `RelativeTimeFormatterTests` in the SDK test target, where the app
    /// bundle is absent and `String(localized:)` deterministically falls
    /// back to the French `defaultValue` (see `RelativeTimeFormatter`'s own
    /// header comment). This app-hosted target runs against the real app
    /// bundle under the simulator's actual locale (not guaranteed French),
    /// so this test asserts the locale-independent "long style wraps the
    /// short label" structural property instead of a hardcoded language.
    func test_relativeTime_fiveMinutesAgo_usesLongStyleAgoFrame() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveMinutesAgo = now.addingTimeInterval(-5 * 60)

        let short = RelativeTimeFormatter.shortString(for: fiveMinutesAgo, now: now)
        let long = ParticipantsView.relativeTime(from: fiveMinutesAgo, now: now)

        XCTAssertNotEqual(long, short, "Long style must wrap the short label in an 'ago' frame, not equal it verbatim")
        XCTAssertTrue(long.contains(short), "Long style must still carry the same unit label as the short label, just framed")
    }
}
