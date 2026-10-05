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

    /// « ici » garde son petit pulse au repos ; l'activité et le plein écran
    /// le rendent bien plus visible (#9065).
    /// Une échelle pour le point ET le mood (porteur 2026-10-02, #9065) : en
    /// plein écran il se stabilise et pulse de manière imperceptible ; au
    /// repos, un petit pulse ; à l'activité, une respiration à peine plus
    /// élevée. Seule l'arrivée pulse bien visiblement.
    func test_hereWave_ladder_focusIsImperceptible_restIsGentle_activityIsVivid() {
        let hush = PresenceHereWave.hush
        let rest = PresenceHereWave.rest
        let vivid = PresenceHereWave.vivid
        XCTAssertGreaterThan(hush.peakScale, 1)
        XCTAssertLessThan(hush.peakScale, rest.peakScale)
        XCTAssertLessThan(hush.startOpacity, rest.startOpacity)
        XCTAssertGreaterThan(vivid.peakScale, rest.peakScale)
        XCTAssertLessThan(vivid.peakScale, rest.peakScale + 0.5, "l'activité respire à peine plus fort que le repos")
        XCTAssertGreaterThan(vivid.startOpacity, rest.startOpacity)
        XCTAssertLessThanOrEqual(vivid.startOpacity, 0.4)
        XCTAssertEqual(PresenceHereWave.for(.here), .rest)
        XCTAssertEqual(PresenceHereWave.for(.active), .vivid)
        XCTAssertEqual(PresenceHereWave.for(.focused), .hush)
        XCTAssertNil(PresenceHereWave.for(.absent))
    }

    func test_arrival_isABigPulse() {
        XCTAssertGreaterThanOrEqual(PresenceArrival.peakScale, 3)
        XCTAssertGreaterThanOrEqual(PresenceArrival.lineWidth, 3)
    }

    func test_pulses_online_keepsItsBreath_awayDoesNot() {
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

    func test_diameter_inTheConversationHeader_isSmaller() {
        XCTAssertEqual(AvatarContext.conversationHeaderCollapsed.hereDotRatio, 0.40, accuracy: 0.001)
        XCTAssertEqual(AvatarContext.conversationHeaderExpanded.hereDotRatio, 0.40, accuracy: 0.001)
        XCTAssertEqual(AvatarContext.messageBubble.hereDotRatio, 0.52, accuracy: 0.001)
        XCTAssertEqual(AvatarPresenceDot.here.diameter(avatarSize: 44, hereRatio: 0.40), 44 * 0.40, accuracy: 0.001)
        XCTAssertEqual(AvatarPresenceDot.presence(.online).diameter(avatarSize: 44, hereRatio: 0.40), 44 * 0.26, accuracy: 0.001)
    }

    func test_centerOffset_withoutRing_putsTheDotCentreOnTheCircleAt45Degrees() {
        assertCentreOnCircle(avatarSize: 44, frameSize: 44, dot: AvatarPresenceDot.here.diameter(avatarSize: 44))
        assertCentreOnCircle(avatarSize: 28, frameSize: 28, dot: AvatarPresenceDot.presence(.online).diameter(avatarSize: 28))
    }

    func test_centerOffset_withStoryRing_putsTheDotCentreOnTheCircleAt45Degrees() {
        assertCentreOnCircle(avatarSize: 44, frameSize: 50, dot: AvatarPresenceDot.here.diameter(avatarSize: 44))
    }

    // MARK: - Le contour du mood (#9065)

    func test_moodOutline_isIndigoHere_greenOnline_noneOtherwise() {
        XCTAssertEqual(AvatarPresenceDot.here.moodOutline, PresenceStyle.hereDotColor)
        XCTAssertEqual(AvatarPresenceDot.presence(.online).moodOutline, MeeshyColors.success)
        XCTAssertNil(AvatarPresenceDot.presence(.away).moodOutline)
        XCTAssertNil(AvatarPresenceDot.presence(.idle).moodOutline)
    }

    /// En plein écran, le mood ne s'immobilise pas : il pulse à peine (porteur
    /// 2026-10-02, #9065).
    func test_moodBreathes_asUsual_butBarelyPulsesWhileThePeerWatchesFullScreen() {
        XCTAssertEqual(MeeshyMoodBadge.motion(animates: true, reduceMotion: false, hushed: false), .breathe)
        XCTAssertEqual(MeeshyMoodBadge.motion(animates: true, reduceMotion: false, hushed: true), .hush)
        XCTAssertEqual(MeeshyMoodBadge.motion(animates: true, reduceMotion: true, hushed: true), .still)
        XCTAssertEqual(MeeshyMoodBadge.motion(animates: false, reduceMotion: false, hushed: false), .still)
        XCTAssertGreaterThan(MeeshyMoodBadge.hushedScale, MeeshyMoodBadge.restingScale)
        XCTAssertLessThanOrEqual(MeeshyMoodBadge.hushedScale - 1, (MeeshyMoodBadge.pulsedScale - 1) / 3)
    }

    /// Dans la liste et l'en-tête, le mood respire par le pulse de l'avatar :
    /// c'est lui qui se fait à peine perceptible en plein écran (#9065).
    /// Le mood suit la même échelle que le point : il est au milieu, c'est
    /// tout (#9065).
    func test_avatarMoodPulse_followsTheDotLadder() {
        XCTAssertEqual(MeeshyAvatar.moodPulseIntensity(.absent), 0.12, accuracy: 0.0001)
        XCTAssertEqual(MeeshyAvatar.moodPulseIntensity(.here), 0.12, accuracy: 0.0001)
        XCTAssertEqual(MeeshyAvatar.moodPulseIntensity(.active), 0.16, accuracy: 0.0001)
        XCTAssertEqual(MeeshyAvatar.moodPulseIntensity(.focused), MeeshyMoodBadge.hushedScale - 1, accuracy: 0.0001)
    }

    func test_moodOutlineWidth_scalesWithTheBadge_neverHairline() {
        XCTAssertEqual(MeeshyMoodBadge.outlineWidth(diameter: 10), 1.5, accuracy: 0.001)
        XCTAssertEqual(MeeshyMoodBadge.outlineWidth(diameter: 32), 32 * 0.07, accuracy: 0.001)
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
