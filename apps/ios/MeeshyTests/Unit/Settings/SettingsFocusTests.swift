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

    /// Les invites du dépôt passent par la demande — plus aucune n'ouvre les
    /// Réglages « en haut de page ». Garde de source : la seule mesure d'une
    /// fermeture passée à un bouton.
    func test_settingsInvites_requestTheirFocus() throws {
        let consent = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/MessageListViewController+MessageCellHandlers.swift")
        XCTAssertTrue(consent.contains("SettingsFocusRequest.shared.request(.voiceProfile)"))
        let pin = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationListView+Presentations.swift")
        XCTAssertTrue(pin.contains("SettingsFocusRequest.shared.request(.masterPin)"))
    }
}
