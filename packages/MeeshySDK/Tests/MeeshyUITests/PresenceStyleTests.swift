import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Locks the CENTRAL presence color mapping (PresenceStyle) — every surface
/// (MeeshyAvatar, UserIdentityBar, profile, story viewer) consumes it, so this
/// suite is the single spec of the 1/3/5 palette:
/// green (success #34D399) = online, orange (warning #FBBF24) = away,
/// gray (#9CA3AF) = idle — DISPLAYED on avatar dots. `offline` renders NO
/// indicator anywhere (showsIndicator == false); its gray + label survive only
/// for explicitly labeled contexts. Only .online pulses.
final class PresenceStyleTests: XCTestCase {

    func test_dotColor_online_isGreen() {
        XCTAssertEqual(PresenceState.online.dotColor, MeeshyColors.success)
    }

    func test_dotColor_away_isOrange() {
        XCTAssertEqual(PresenceState.away.dotColor, MeeshyColors.warning)
    }

    func test_dotColor_idle_isGray() {
        XCTAssertEqual(PresenceState.idle.dotColor, MeeshyColors.neutral400)
    }

    func test_dotColor_offline_isGray_forLabeledContextsOnly() {
        XCTAssertEqual(PresenceState.offline.dotColor, MeeshyColors.neutral400)
    }

    func test_pulses_onlyOnline() {
        XCTAssertTrue(PresenceState.online.pulses)
        XCTAssertFalse(PresenceState.away.pulses)
        XCTAssertFalse(PresenceState.idle.pulses)
        XCTAssertFalse(PresenceState.offline.pulses)
    }

    func test_showsIndicator_trueForEveryStateExceptOffline() {
        XCTAssertTrue(PresenceState.online.showsIndicator)
        XCTAssertTrue(PresenceState.away.showsIndicator)
        XCTAssertTrue(PresenceState.idle.showsIndicator)
        XCTAssertFalse(PresenceState.offline.showsIndicator)
    }

    func test_localizedLabel_coversEveryState() {
        XCTAssertFalse(PresenceState.online.localizedLabel.isEmpty)
        XCTAssertFalse(PresenceState.away.localizedLabel.isEmpty)
        XCTAssertFalse(PresenceState.idle.localizedLabel.isEmpty)
        XCTAssertFalse(PresenceState.offline.localizedLabel.isEmpty)
    }

    func test_localizedLabel_idle_isDistinctFromNeighborStates() {
        XCTAssertNotEqual(PresenceState.idle.localizedLabel, PresenceState.away.localizedLabel)
        XCTAssertNotEqual(PresenceState.idle.localizedLabel, PresenceState.online.localizedLabel)
        XCTAssertNotEqual(PresenceState.idle.localizedLabel, PresenceState.offline.localizedLabel)
    }
}
