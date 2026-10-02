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

    /// « ici » ne pulse plus de lui-même : il pulse quand le pair regarde,
    /// écoute ou agit (#9061) — `MeeshyAvatar.isHereActive`.
    func test_pulses_here_isLeftToActivity_onlinePulses() {
        XCTAssertFalse(AvatarPresenceDot.here.pulses)
        XCTAssertTrue(AvatarPresenceDot.presence(.online).pulses)
        XCTAssertFalse(AvatarPresenceDot.presence(.away).pulses)
    }

    func test_localizedLabel_here_isDistinctFromOnline() {
        XCTAssertFalse(AvatarPresenceDot.here.localizedLabel.isEmpty)
        XCTAssertNotEqual(AvatarPresenceDot.here.localizedLabel, PresenceState.online.localizedLabel)
    }

    // MARK: - Les transitions du point (#9047)

    func test_transitionKey_changesWhenTheDotChangesNature() {
        XCTAssertNotEqual(AvatarPresenceDot.here.transitionKey, AvatarPresenceDot.presence(.online).transitionKey,
                          "passer d'« ici » à « en ligne » remplace le point : l'indigo diminue, le vert rebondit")
        XCTAssertNotEqual(AvatarPresenceDot.presence(.online).transitionKey, AvatarPresenceDot.presence(.away).transitionKey)
        XCTAssertEqual(AvatarPresenceDot.here.transitionKey, AvatarPresenceDot.here.transitionKey)
    }

    func test_arrivalRipple_onlyForHere() {
        XCTAssertTrue(AvatarPresenceDot.here.arrivesWithRipple, "le point indigo pulse en arrivant")
        XCTAssertFalse(AvatarPresenceDot.presence(.online).arrivesWithRipple)
    }

    // MARK: - Taille et place du point (#9061)

    func test_diameter_here_isTwiceThePresenceDot() {
        XCTAssertEqual(AvatarPresenceDot.here.diameter(avatarSize: 44), 44 * 0.52, accuracy: 0.001)
        XCTAssertEqual(AvatarPresenceDot.presence(.online).diameter(avatarSize: 44), 44 * 0.26, accuracy: 0.001)
    }

    func test_centerOffset_withoutRing_putsTheDotCentreOnTheCircleAt45Degrees() {
        assertCentreOnCircle(avatarSize: 44, frameSize: 44, dot: AvatarPresenceDot.here.diameter(avatarSize: 44))
        assertCentreOnCircle(avatarSize: 28, frameSize: 28, dot: AvatarPresenceDot.presence(.online).diameter(avatarSize: 28))
    }

    func test_centerOffset_withStoryRing_putsTheDotCentreOnTheCircleAt45Degrees() {
        assertCentreOnCircle(avatarSize: 44, frameSize: 50, dot: AvatarPresenceDot.here.diameter(avatarSize: 44))
    }

    private func assertCentreOnCircle(avatarSize: CGFloat, frameSize: CGFloat, dot: CGFloat, line: UInt = #line) {
        let offset = AvatarPresenceDot.centerOffset(avatarSize: avatarSize, frameSize: frameSize, dotDiameter: dot)
        let centreX = frameSize - dot / 2 + offset.width
        let centreY = frameSize - dot / 2 + offset.height
        let onCircle = frameSize / 2 + avatarSize / 2 * cos(.pi / 4)
        XCTAssertEqual(centreX, onCircle, accuracy: 0.001, line: line)
        XCTAssertEqual(centreY, onCircle, accuracy: 0.001, line: line)
    }
}
