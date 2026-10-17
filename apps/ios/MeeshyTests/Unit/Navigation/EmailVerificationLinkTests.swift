import XCTest
@testable import Meeshy

/// #8035 — le lien de l'e-mail « code + lien » (`/auth/verify-email?token=…&email=…`)
/// s'analyse comme le lien de connexion, et ouvre la session par le même site.
@MainActor
final class EmailVerificationLinkTests: XCTestCase {

    func test_parse_universalLink_verifyEmail_returnsTokenAndEmail() {
        let url = URL(string: "https://meeshy.me/auth/verify-email?token=tok123&email=nouveau%2Btest%40exemple.com")!

        XCTAssertEqual(DeepLinkParser.parse(url), .emailVerificationLink(token: "tok123", email: "nouveau+test@exemple.com"))
    }

    func test_parse_customScheme_verifyEmail_returnsTokenAndEmail() {
        let url = URL(string: "meeshy://auth/verify-email?email=a@b.co&token=xyz")!

        XCTAssertEqual(DeepLinkParser.parse(url), .emailVerificationLink(token: "xyz", email: "a@b.co"))
    }

    func test_parse_verifyEmail_withoutEmailOrToken_isNotASignInLink() {
        let noEmail = URL(string: "https://meeshy.me/auth/verify-email?token=tok")!
        let blankToken = URL(string: "https://meeshy.me/auth/verify-email?token=%20&email=a@b.co")!

        XCTAssertEqual(DeepLinkParser.parse(noEmail), .external(noEmail))
        XCTAssertEqual(DeepLinkParser.parse(blankToken), .external(blankToken))
    }

    func test_parse_magicLink_isUnchanged() {
        let url = URL(string: "https://meeshy.me/auth/magic-link?token=abc")!

        XCTAssertEqual(DeepLinkParser.parse(url), .magicLink(token: "abc"))
    }

    // MARK: - #10859 — le secret voyage dans le FRAGMENT, jamais dans la requête

    func test_parse_verifyEmail_fragmentLink_returnsTokenAndEmail() {
        let url = URL(string: "https://meeshy.me/auth/verify-email?via=email#token=tok123&email=nouveau%2Btest%40exemple.com")!

        XCTAssertEqual(DeepLinkParser.parse(url), .emailVerificationLink(token: "tok123", email: "nouveau+test@exemple.com"))
    }

    func test_parse_magicLink_fragmentLink_returnsToken() {
        let url = URL(string: "https://meeshy.me/auth/magic-link?returnUrl=%2Fc%2F1&via=email#token=abc")!

        XCTAssertEqual(DeepLinkParser.parse(url), .magicLink(token: "abc"))
    }

    func test_parse_aliasPaths_readTheFragment() {
        let magic = URL(string: "https://meeshy.me/auth/email-link/magic-link?via=email&token=#token=abc")!
        let verify = URL(string: "https://meeshy.me/auth/email-link/verify-email?via=email&token=#token=t1&email=a%40b.co")!

        XCTAssertEqual(DeepLinkParser.parse(magic), .magicLink(token: "abc"))
        XCTAssertEqual(DeepLinkParser.parse(verify), .emailVerificationLink(token: "t1", email: "a@b.co"))
    }

    func test_parse_fragmentWins_overAQueryValue() {
        let url = URL(string: "https://meeshy.me/auth/magic-link?token=old#token=new")!

        XCTAssertEqual(DeepLinkParser.parse(url), .magicLink(token: "new"))
    }

    func test_verifyEmailLink_isClaimedAndDoesNotWaitForSignIn() {
        let link = DeepLinkRouter.link(for: .emailVerificationLink(token: "t", email: "a@b.co"))

        XCTAssertEqual(link, .emailVerificationLink(token: "t", email: "a@b.co"))
        XCTAssertEqual(link?.opensAfterSignIn, false)
    }

    // MARK: - SignInLink

    func test_signInLink_readsBothDestinations() {
        XCTAssertEqual(SignInLink(.magicLink(token: "m")), .magic(token: "m"))
        XCTAssertEqual(SignInLink(.emailVerificationLink(token: "t", email: "a@b.co")), .emailVerification(token: "t", email: "a@b.co"))
        XCTAssertEqual(SignInLink(DeepLink.emailVerificationLink(token: "t", email: "a@b.co")), .emailVerification(token: "t", email: "a@b.co"))
        XCTAssertNil(SignInLink(.ownProfile))
        XCTAssertNil(SignInLink(DeepLink.ownProfile))
    }
}
