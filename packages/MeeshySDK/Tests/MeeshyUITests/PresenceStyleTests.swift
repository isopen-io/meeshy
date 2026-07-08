import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Locks the CENTRAL presence color mapping (PresenceStyle) — every surface
/// (MeeshyAvatar, UserIdentityBar, profile, story viewer) consumes it, so this
/// suite is the single spec of the palette:
/// green (success #34D399) = online/recent, orange (warning #FBBF24) = away,
/// gray (#9CA3AF) = offline. Only .online pulses.
final class PresenceStyleTests: XCTestCase {

    func test_dotColor_onlineAndRecent_areGreen() {
        XCTAssertEqual(PresenceState.online.dotColor, MeeshyColors.success)
        XCTAssertEqual(PresenceState.recent.dotColor, MeeshyColors.success)
    }

    func test_dotColor_away_isOrange() {
        XCTAssertEqual(PresenceState.away.dotColor, MeeshyColors.warning)
    }

    func test_dotColor_offline_isGray() {
        XCTAssertEqual(PresenceState.offline.dotColor, MeeshyColors.neutral400)
    }

    func test_pulses_onlyOnline() {
        XCTAssertTrue(PresenceState.online.pulses)
        XCTAssertFalse(PresenceState.recent.pulses)
        XCTAssertFalse(PresenceState.away.pulses)
        XCTAssertFalse(PresenceState.offline.pulses)
    }

    func test_localizedLabel_coversEveryState() {
        XCTAssertFalse(PresenceState.online.localizedLabel.isEmpty)
        XCTAssertFalse(PresenceState.recent.localizedLabel.isEmpty)
        XCTAssertFalse(PresenceState.away.localizedLabel.isEmpty)
        XCTAssertFalse(PresenceState.offline.localizedLabel.isEmpty)
    }
}
