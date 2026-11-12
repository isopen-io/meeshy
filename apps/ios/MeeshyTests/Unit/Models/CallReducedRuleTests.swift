import XCTest
@testable import Meeshy

/// P18.4 · P18.5 · P18.10 — l'appel réduit (planche `appels-vue-finale`, vues P18 et S1) :
/// le liseré et l'avatar de la bulle portent la couleur de l'autre, la bulle porte
/// l'étiquette de verre « nom · durée », et pendant mon partage la bannière dit l'écran
/// et « nom · durée » sans jamais se replier en bulle. La loi est pure ; les vues la dessinent.
@MainActor
final class CallReducedRuleTests: XCTestCase {

    // MARK: - Le nom

    func test_title_duo_prefersTheNameIGaveThePerson() {
        XCTAssertEqual(CallReducedRule.title(givenName: "Maman", groupName: nil, displayName: "Awa"), "Maman")
    }

    func test_title_duo_fallsBackToTheDisplayName() {
        XCTAssertEqual(CallReducedRule.title(givenName: nil, groupName: nil, displayName: "Awa"), "Awa")
        XCTAssertEqual(CallReducedRule.title(givenName: "  ", groupName: nil, displayName: "Awa"), "Awa")
    }

    func test_title_group_isTheGroupName() {
        XCTAssertEqual(CallReducedRule.title(givenName: nil, groupName: "Famille", displayName: "Awa"), "Famille")
    }

    func test_title_unknown_isNil() {
        XCTAssertNil(CallReducedRule.title(givenName: nil, groupName: nil, displayName: nil))
        XCTAssertNil(CallReducedRule.title(givenName: " ", groupName: "", displayName: "\n"))
    }

    // MARK: - « nom · durée »

    func test_caption_joinsNameAndDuration() {
        XCTAssertEqual(CallReducedRule.caption(title: "Awa", duration: "04:12"), "Awa · 04:12")
    }

    func test_caption_withoutName_isTheDurationAlone() {
        XCTAssertEqual(CallReducedRule.caption(title: nil, duration: "04:12"), "04:12")
    }

    // MARK: - Pas de repli en bulle pendant mon partage

    func test_collapse_whileSharing_isRefused() {
        XCTAssertFalse(CallReducedRule.allowsCollapseToBubble(isSharingScreen: true))
        XCTAssertTrue(CallReducedRule.allowsCollapseToBubble(isSharingScreen: false))
    }

    // MARK: - La couleur de l'autre (fonction partagée)

    func test_peerColor_isTheSharedSpeakerColor_andIsStablePerPerson() {
        XCTAssertEqual(CallPeerSpeech.colorHex(forPeer: "u-awa"), CallSpeakerColor.hex(for: "u-awa"))
        XCTAssertNotEqual(CallSpeakerColor.hex(for: "u-awa"), CallSpeakerColor.hex(for: "u-moussa"))
    }

    func test_peerColor_withoutIdentity_fallsBackToTheBrand() {
        XCTAssertEqual(CallPeerSpeech.colorHex(forPeer: nil), MeeshyColors.brandPrimaryHex)
    }
}

/// Le câblage : les vues lisent la loi et la couleur partagées, jamais une teinte locale.
@MainActor
final class CallReducedWiringTests: XCTestCase {
    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/\(path)"))
    }

    func test_participantVisual_ringAndAvatarTakeThePeerColor_fromTheSharedFunction() throws {
        let source = try code("CallParticipantVisual.swift")
        XCTAssertTrue(source.contains("CallPeerSpeech.colorHex(forPeer: callManager.remoteUserId)"))
        XCTAssertTrue(source.contains("accentColor: ringsInPeerColor ? peerColorHex"))
        XCTAssertTrue(source.contains("CallSelfTileStroke.color(forKey: callManager.remoteUserId)"), "le liseré des vignettes, pas une teinte de plus")
        XCTAssertTrue(source.contains("lineWidth: ringsInPeerColor ? CallSelfTileStroke.lineWidth : 1"))
    }

    func test_bubble_asksForThePeerRing_andCarriesTheGlassNameplate() throws {
        let source = try code("CallBubbleView.swift")
        XCTAssertTrue(source.contains("ringsInPeerColor: true"))
        XCTAssertTrue(source.contains("CallReducedCaption(callManager: callManager, style: .glass)"))
    }

    func test_caption_glassIsTheSharedNameplate_andReadsTheHeaderNamesUnderTheClock() throws {
        let source = try code("CallReducedCaption.swift")
        XCTAssertTrue(source.contains("CallTileNameplate(title: text)"), "le verre est la plaque partagée, pas un verre de plus")
        XCTAssertTrue(source.contains("CallDurationClock"))
        XCTAssertTrue(source.contains("CallHeaderNames.resolve("))
        XCTAssertTrue(source.contains("CallReducedRule.caption("))
    }

    func test_pill_whileSharing_showsTheScreenCaption_andNeverCollapses() throws {
        let source = try code("FloatingCallPillView.swift")
        XCTAssertTrue(source.contains("CallReducedCaption(callManager: callManager, style: .screenShare)"))
        XCTAssertTrue(source.contains("allowsCollapse && CallBubbleGestureResolver.shouldCollapse("))
        XCTAssertTrue(source.contains("guard allowsCollapse else { return }"))
        XCTAssertTrue(source.contains("CallReducedRule.allowsCollapseToBubble(isSharingScreen: callManager.screenShare.isSharing)"))
    }
}
