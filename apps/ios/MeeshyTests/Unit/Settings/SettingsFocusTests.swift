import XCTest
@testable import Meeshy

/// #16339 — une invite de réglage mène AU réglage : la demande désigne sa
/// section, se consomme une seule fois, et chaque invite du fil y passe.
@MainActor
final class SettingsFocusTests: XCTestCase {

    func test_voiceProfile_anchorsTheVoiceSectionWithoutSecurity() {
        XCTAssertEqual(SettingsFocus.voiceProfile.settingsAnchor, "settings.section.voice")
        XCTAssertFalse(SettingsFocus.voiceProfile.opensSecurity)
    }

    func test_masterPin_opensSecurityFromTheAccountSection() {
        XCTAssertEqual(SettingsFocus.masterPin.settingsAnchor, "settings.section.account")
        XCTAssertTrue(SettingsFocus.masterPin.opensSecurity)
    }

    func test_consume_pendingRequest_isServedOnce() {
        let request = SettingsFocusRequest()
        request.request(.voiceProfile)
        XCTAssertEqual(request.consume(), .voiceProfile)
        XCTAssertNil(request.consume(), "un retour aux Réglages ne rejoue pas la mise en évidence")
    }

    func test_consumeMatching_otherFocus_leavesTheRequest() {
        let request = SettingsFocusRequest()
        request.request(.voiceProfile)
        XCTAssertFalse(request.consume(.masterPin))
        XCTAssertEqual(request.pending, .voiceProfile)
        XCTAssertTrue(request.consume(.voiceProfile))
        XCTAssertNil(request.pending)
    }

    // MARK: - Le pli des annexes (#18589)

    func test_settingsAnchor_isTheAnchorOfTheBlockHoldingItsDestination() {
        for focus in SettingsFocus.allCases {
            XCTAssertEqual(focus.settingsAnchor, SettingsLayout.block(containing: focus.destination)?.id.anchor, "\(focus)")
        }
    }

    func test_unfoldsAnnex_followsTheStratumOfItsDestination() {
        for focus in SettingsFocus.allCases {
            XCTAssertEqual(focus.unfoldsAnnex, SettingsLayout.unfoldsAnnex(toReach: focus.destination), "\(focus)")
        }
        XCTAssertFalse(SettingsFocus.masterPin.unfoldsAnnex, "le master PIN vit dans Compte, en haut")
    }

    func test_annexUnfolded_aFocusOnAnAnnexDestination_unfoldsBeforeScrolling() {
        XCTAssertTrue(SettingsLayout.annexUnfolded(current: false, reaching: .storage))
        XCTAssertTrue(SettingsLayout.annexUnfolded(current: true, reaching: .privacy), "un pli ouvert le reste")
        XCTAssertFalse(SettingsLayout.annexUnfolded(current: false, reaching: .transcriptionMine))
    }

    /// Les invites du dépôt passent par la demande — plus aucune n'ouvre les
    /// Réglages « en haut de page ». Garde de source : la seule mesure d'une
    /// fermeture passée à un bouton.
    func test_settingsInvites_requestTheirFocus() throws {
        let consent = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/MessageListViewController+MessageCellHandlers.swift")
        XCTAssertTrue(consent.contains("VoiceSetupLauncher.open(.voice)"), "#16418 — la note passe par la loi de destination")
        let pin = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationListView+Presentations.swift")
        XCTAssertTrue(pin.contains("SettingsFocusRequest.shared.request(.masterPin)"))
    }
}
