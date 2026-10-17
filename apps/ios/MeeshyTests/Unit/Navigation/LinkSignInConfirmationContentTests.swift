import XCTest
@testable import Meeshy
import MeeshySDK

/// #10880 — la question « Se connecter en tant que @x ? » montre le compte du
/// lien comme le web : avatar, @nom, nom affiché — le même contrat que la
/// réponse `requiresConfirmation` de la passerelle.
@MainActor
final class LinkSignInConfirmationContentTests: XCTestCase {

    private func account(displayName: String? = "Mallory Martin", avatar: String? = "https://cdn.meeshy.me/a/mallory.jpg") -> LinkSignInAccount {
        LinkSignInAccount(id: "attacker", username: "mallory", displayName: displayName, avatar: avatar)
    }

    func test_content_carriesTheAvatar_theHandle_andTheDisplayName() {
        let content = LinkSignInConfirmationContent(account: account(), signedIn: nil)

        XCTAssertEqual(content.avatarURL, "https://cdn.meeshy.me/a/mallory.jpg")
        XCTAssertEqual(content.handle, "@mallory")
        XCTAssertEqual(content.displayName, "Mallory Martin")
        XCTAssertTrue(content.title.contains("@mallory"))
    }

    func test_content_hidesADisplayNameThatRepeatsTheHandle_orIsBlank() {
        XCTAssertNil(LinkSignInConfirmationContent(account: account(displayName: "mallory"), signedIn: nil).displayName)
        XCTAssertNil(LinkSignInConfirmationContent(account: account(displayName: "   "), signedIn: nil).displayName)
        XCTAssertNil(LinkSignInConfirmationContent(account: account(displayName: nil), signedIn: nil).displayName)
    }

    func test_content_withoutAvatar_fallsBackToInitials() {
        let content = LinkSignInConfirmationContent(account: account(avatar: nil), signedIn: nil)

        XCTAssertNil(content.avatarURL)
        XCTAssertEqual(content.avatarName, "Mallory Martin")
    }

    func test_content_avatarOutsideMeeshy_isNotLoaded() {
        ["https://tracker.example/p.gif", "http://cdn.meeshy.me/a.jpg", "https://meeshy.me.evil.example/a.jpg",
         "//tracker.example/a.jpg", "https://u@cdn.meeshy.me/a.jpg"]
            .forEach { XCTAssertNil(LinkSignInConfirmationContent(account: account(avatar: $0), signedIn: nil).avatarURL, $0) }
        XCTAssertEqual(LinkSignInConfirmationContent(account: account(avatar: "/api/v1/a/m.jpg"), signedIn: nil).avatarURL, "/api/v1/a/m.jpg")
    }

    func test_content_blankAvatar_isNoAvatar() {
        XCTAssertNil(LinkSignInConfirmationContent(account: account(avatar: "  "), signedIn: nil).avatarURL)
    }

    func test_content_namesTheOpenAccount_whenOneIsSignedIn() {
        let content = LinkSignInConfirmationContent(account: account(), signedIn: MeeshyUser(id: "me", username: "moi", displayName: "Moi"))

        XCTAssertTrue(content.message.contains("Moi (@moi)"))
    }

    func test_accountCard_readsAsOneVoiceOverElement() {
        let content = LinkSignInConfirmationContent(account: account(), signedIn: nil)

        XCTAssertEqual(content.accountAccessibilityLabel, "Mallory Martin (@mallory)")
    }

    func test_signInButton_armsOnlyAfterADelay() {
        XCTAssertGreaterThanOrEqual(LinkSignInConfirmationView.armingDelay, .milliseconds(500))
    }

    func test_theOpenerAsksThroughTheSheet_byDefault() {
        XCTAssertFalse((AccountReplacementAlert.shared as AnyObject) is LinkSignInConfirming,
                       "la question du lien se pose par la feuille avec avatar, plus par l'alerte système")
    }
}
