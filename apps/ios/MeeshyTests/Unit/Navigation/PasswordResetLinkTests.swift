import XCTest
@testable import Meeshy

/// #10868 — le lien de réinitialisation reçu par e-mail
/// (`/reset-password?via=email#token=…`, #10859 : le jeton dans le FRAGMENT)
/// ouvre « Nouveau mot de passe » dans l'app.
@MainActor
final class PasswordResetLinkTests: XCTestCase {

    // MARK: - Analyse

    func test_parse_emailFragmentLink_returnsTheToken() {
        let url = URL(string: "https://meeshy.me/reset-password?via=email#token=abc123")!

        XCTAssertEqual(DeepLinkParser.parse(url), .passwordResetLink(token: "abc123"))
    }

    func test_parse_legacyQueryLink_returnsTheToken() {
        let url = URL(string: "https://meeshy.me/reset-password?token=legacy42")!

        XCTAssertEqual(DeepLinkParser.parse(url), .passwordResetLink(token: "legacy42"))
    }

    func test_parse_authAndAliasPaths_readTheFragment() {
        let auth = URL(string: "https://meeshy.me/auth/reset-password?via=email#token=t1")!
        let alias = URL(string: "https://meeshy.me/auth/email-link/reset-password?via=email#token=t2")!

        XCTAssertEqual(DeepLinkParser.parse(auth), .passwordResetLink(token: "t1"))
        XCTAssertEqual(DeepLinkParser.parse(alias), .passwordResetLink(token: "t2"))
    }

    func test_parse_customScheme_isNeverAResetLink() {
        let scheme = URL(string: "meeshy://reset-password#token=t3")!
        let schemeAuth = URL(string: "meeshy://auth/reset-password#token=t4")!
        let schemeAlias = URL(string: "meeshy://auth/email-link/reset-password#token=t5")!

        XCTAssertEqual(DeepLinkParser.parse(scheme), .external(scheme),
                       "Any page or app can open meeshy:// — it must not present a third party's reset token")
        XCTAssertEqual(DeepLinkParser.parse(schemeAuth), .external(schemeAuth))
        XCTAssertEqual(DeepLinkParser.parse(schemeAlias), .external(schemeAlias))
    }

    func test_parse_fragmentWins_overAQueryValue() {
        let url = URL(string: "https://meeshy.me/reset-password?token=old#token=new")!

        XCTAssertEqual(DeepLinkParser.parse(url), .passwordResetLink(token: "new"))
    }

    func test_parse_withoutToken_isNotClaimed() {
        let bare = URL(string: "https://meeshy.me/reset-password")!
        let blank = URL(string: "https://meeshy.me/reset-password?via=email#token=%20")!

        XCTAssertEqual(DeepLinkParser.parse(bare), .external(bare))
        XCTAssertEqual(DeepLinkParser.parse(blank), .external(blank))
        XCTAssertFalse(DeepLinkParser.isMeeshyDeepLink(bare))
    }

    // MARK: - Ouverture

    func test_handle_resetLink_presentsTheNewPasswordStage() {
        let presenter = PasswordResetLinkPresenter(presentsUI: false)
        let router = DeepLinkRouter(passwordReset: presenter)

        let claimed = router.handle(url: URL(string: "https://meeshy.me/reset-password?via=email#token=abc123")!)

        XCTAssertTrue(claimed)
        XCTAssertEqual(presenter.stage, .newPassword(token: "abc123"))
        XCTAssertNil(router.pendingDeepLink, "A reset link is not a place in the app: nothing waits for sign-in")
    }

    func test_requestNewLink_movesToTheForgotPasswordStage() {
        let presenter = PasswordResetLinkPresenter(presentsUI: false)
        presenter.present(token: "dead")

        presenter.requestNewLink()

        XCTAssertEqual(presenter.stage, .requestNewLink)
    }

    func test_dismiss_clearsTheStage() {
        let presenter = PasswordResetLinkPresenter(presentsUI: false)
        presenter.present(token: "abc")

        presenter.dismiss()

        XCTAssertNil(presenter.stage)
    }

    func test_inAppTap_onAResetLink_leavesTheApp() {
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/reset-password?via=email#token=x")!))
    }
}
