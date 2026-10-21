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

    /// #10870 — le lien « code + lien » OUVRE une session : sous `meeshy://`,
    /// qu'importe quelle page ou app ouvre, il connecterait au compte d'un tiers.
    func test_parse_customScheme_verifyEmail_isRefused() {
        let url = URL(string: "meeshy://auth/verify-email?email=a@b.co&token=xyz")!

        XCTAssertEqual(DeepLinkParser.parse(url), .external(url))
    }

    /// #10870 — toutes les formes d'un lien de connexion sous `meeshy://` sont
    /// refusées par les DEUX voies (parseur et routeur système), alias, jeton
    /// en segment, fragment et casse du host compris ; seul le lien universel
    /// https les porte.
    func test_signInLinks_underCustomScheme_areRefusedByBothPaths() {
        let forms = [
            "meeshy://auth/magic-link?token=x",
            "meeshy://auth/magic-link/x",
            "meeshy://auth/magic-link?via=email#token=x",
            "meeshy://AUTH/magic-link?token=x",
            "meeshy:///auth/magic-link?token=x",
            "meeshy://auth/email-link/magic-link#token=x",
            "meeshy://auth/verify-email#token=x&email=a%40b.co",
            "meeshy://auth/email-link/verify-email?token=x&email=a%40b.co"
        ]
        for raw in forms {
            let url = URL(string: raw)!
            XCTAssertEqual(DeepLinkParser.parse(url), .external(url), raw)
            XCTAssertNil(SignInLink(DeepLinkParser.parse(url)), raw)
            let router = DeepLinkRouter()
            XCTAssertFalse(router.handle(url: url), raw)
            XCTAssertNil(router.pendingDeepLink, raw)
        }
    }

    /// #10870 — la cible d'un lien suivi `/l/<jeton>` est choisie par son
    /// CRÉATEUR : y mettre son propre lien de connexion connecterait le lecteur
    /// à son compte. Un lien suivi ne mène jamais à un lien qui connecte ni à
    /// une réinitialisation.
    func test_trackedLinkTarget_neverLeadsToASignInOrResetLink() {
        for raw in [
            "https://meeshy.me/auth/magic-link?token=x",
            "https://meeshy.me/auth/magic-link/x",
            "https://www.meeshy.me/auth/email-link/magic-link#token=x",
            "https://meeshy.me/auth/verify-email?token=x&email=a%40b.co",
            "https://meeshy.me/reset-password#token=x"
        ] {
            XCTAssertNil(DeepLinkRouter.destination(forOriginalURL: URL(string: raw)!), raw)
        }
        XCTAssertEqual(
            DeepLinkRouter.destination(forOriginalURL: URL(string: "https://meeshy.me/story/s1")!),
            .storyDetail(postId: "s1")
        )
    }

    func test_signInLinks_overHTTPS_stillOpen() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "https://meeshy.me/auth/magic-link/x")!), .magicLink(token: "x"))
        XCTAssertEqual(
            DeepLinkParser.parse(URL(string: "https://meeshy.me/auth/email-link/verify-email#token=x&email=a%40b.co")!),
            .emailVerificationLink(token: "x", email: "a@b.co")
        )
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
