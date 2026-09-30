import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// « Est dans la conversation » (#8892) — le point d'un pair qui a l'écran de
/// la conversation ouvert est à la couleur PRIMAIRE Meeshy, prime sur la
/// présence globale et se rend même quand celle-ci est masquée. Jumeau de
/// `presenceDotHex(status, { here })` (`packages/shared/utils/user-presence.ts`).
@MainActor
final class AvatarPresenceDotTests: XCTestCase {

    func test_hereDotColor_isBrandPrimary() {
        XCTAssertEqual(PresenceStyle.hereDotColor, MeeshyColors.brandPrimary)
    }

    func test_brandPrimaryHex_mirrorsSharedHereHex() {
        XCTAssertEqual(MeeshyColors.brandPrimaryHex.uppercased(), "6366F1")
    }

    func test_resolve_whenHere_winsOverOnline() {
        XCTAssertEqual(AvatarPresenceDot.resolve(presence: .online, isHere: true), .here)
    }

    func test_resolve_whenHereAndPresenceHidden_stillRendersHere() {
        XCTAssertEqual(AvatarPresenceDot.resolve(presence: nil, isHere: true), .here)
        XCTAssertEqual(AvatarPresenceDot.resolve(presence: .offline, isHere: true), .here)
    }

    func test_resolve_whenNotHere_fallsBackToPresence() {
        XCTAssertEqual(AvatarPresenceDot.resolve(presence: .online, isHere: false), .presence(.online))
        XCTAssertEqual(AvatarPresenceDot.resolve(presence: .away, isHere: false), .presence(.away))
        XCTAssertEqual(AvatarPresenceDot.resolve(presence: .idle, isHere: false), .presence(.idle))
    }

    func test_resolve_whenNotHereAndOfflineOrUnknown_rendersNothing() {
        XCTAssertNil(AvatarPresenceDot.resolve(presence: .offline, isHere: false))
        XCTAssertNil(AvatarPresenceDot.resolve(presence: nil, isHere: false))
    }

    func test_color_here_isHereDotColor_andPresenceKeepsCentralMapping() {
        XCTAssertEqual(AvatarPresenceDot.here.color, PresenceStyle.hereDotColor)
        XCTAssertEqual(AvatarPresenceDot.presence(.online).color, MeeshyColors.success)
        XCTAssertEqual(AvatarPresenceDot.presence(.away).color, MeeshyColors.warning)
    }

    func test_pulses_here_pulsesLikeOnline() {
        XCTAssertTrue(AvatarPresenceDot.here.pulses)
        XCTAssertTrue(AvatarPresenceDot.presence(.online).pulses)
        XCTAssertFalse(AvatarPresenceDot.presence(.away).pulses)
    }

    func test_localizedLabel_here_isDistinctFromOnline() {
        XCTAssertFalse(AvatarPresenceDot.here.localizedLabel.isEmpty)
        XCTAssertNotEqual(AvatarPresenceDot.here.localizedLabel, PresenceState.online.localizedLabel)
    }
}
