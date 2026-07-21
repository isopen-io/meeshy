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

    func test_relativeTime_fiveMinutesAgo_usesLongStyleAgoFrame() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let fiveMinutesAgo = now.addingTimeInterval(-5 * 60)

        XCTAssertEqual(
            ParticipantsView.relativeTime(from: fiveMinutesAgo, now: now),
            "il y a 5 min",
            "Must match RelativeTimeFormatter.longString's 'il y a %@' frame"
        )
    }
}
