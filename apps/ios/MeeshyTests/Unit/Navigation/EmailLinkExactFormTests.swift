import XCTest
@testable import Meeshy

/// #10874 — un lien à jeton d'e-mail touché DANS l'app n'ouvre jamais de
/// session : il part au navigateur, et n'entre dans l'app que par le lien
/// universel venu de l'extérieur.
///
/// #10875 — le routeur ne reconnaît un lien à jeton que sur la forme EXACTE
/// qu'écrivent les e-mails. Toute variante (segment en plus, espace, `;`,
/// encodage, invisible, casse, identifiants) est refusée : elle part à Safari.
@MainActor
final class EmailLinkExactFormTests: XCTestCase {

    private func parse(_ raw: String) -> DeepLinkDestination {
        DeepLinkParser.parse(URL(string: raw)!, environmentWebOrigin: "https://meeshy.me")
    }

    private func isSignIn(_ destination: DeepLinkDestination) -> Bool {
        switch destination {
        case .magicLink, .emailVerificationLink, .passwordResetLink: return true
        default: return false
        }
    }

    // MARK: - #10874 : lien touché dans l'app

    func test_inAppTap_onAMagicLink_leavesTheApp() {
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/auth/magic-link?via=email#token=abc")!))
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/auth/magic-link/abc")!))
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/auth/email-link/magic-link#token=abc")!))
    }

    func test_inAppTap_onAVerificationLink_leavesTheApp() {
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/auth/verify-email?via=email#token=t&email=a%40b.co")!))
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co")!))
    }

    func test_inAppTap_onAnyEmailSecretPath_leavesTheApp() {
        [
            "https://meeshy.me/auth/revoke-sessions?token=abc",
            "https://meeshy.me/account/deletion?token=abc",
            "https://meeshy.me/settings/verify-email-change?token=abc",
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.co",
        ].forEach { XCTAssertFalse(InAppLinks.opensInApp(URL(string: $0)!), $0) }
    }

    func test_notificationInvite_onlyEverJoins() {
        XCTAssertTrue(NotificationActionHandler.isInvitation(URL(string: "https://meeshy.me/join/abc")!))
        XCTAssertFalse(NotificationActionHandler.isInvitation(URL(string: "https://meeshy.me/auth/magic-link?via=email#token=abc")!))
        XCTAssertFalse(NotificationActionHandler.isInvitation(URL(string: "https://meeshy.me/reset-password#token=abc")!))
    }

    func test_inAppTap_onAnOrdinaryMeeshyLink_staysInTheApp() {
        XCTAssertTrue(InAppLinks.opensInApp(URL(string: "https://meeshy.me/c/conv1")!))
        XCTAssertTrue(InAppLinks.opensInApp(URL(string: "https://meeshy.me/u/alice")!))
    }

    // MARK: - #10875 : la forme exacte, et elle seule

    func test_exactForms_stillRoute() {
        XCTAssertEqual(parse("https://meeshy.me/auth/magic-link?via=email#token=abc"), .magicLink(token: "abc"))
        XCTAssertEqual(parse("https://meeshy.me/auth/magic-link/tok-3_A"), .magicLink(token: "tok-3_A"))
        XCTAssertEqual(parse("https://www.meeshy.me/auth/email-link/magic-link#token=abc"), .magicLink(token: "abc"))
        XCTAssertEqual(parse("https://meeshy.me/auth/verify-email#token=t&email=a%40b.co"), .emailVerificationLink(token: "t", email: "a@b.co"))
        XCTAssertEqual(parse("https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co"), .emailVerificationLink(token: "t", email: "a@b.co"))
        XCTAssertEqual(parse("https://meeshy.me/reset-password#token=r"), .passwordResetLink(token: "r"))
        XCTAssertEqual(parse("https://meeshy.me/auth/reset-password#token=r"), .passwordResetLink(token: "r"))
        XCTAssertEqual(parse("https://meeshy.me/auth/email-link/reset-password#token=r"), .passwordResetLink(token: "r"))
    }

    func test_variants_areRefused_andLeaveTheAppToSafari() {
        [
            "https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.co",
            "https://meeshy.me/auth/email-link/verify-email/x#token=abc&email=a%40b.co",
            "https://meeshy.me/auth/verify-email%20?token=abc&email=a%40b.co",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/magic-link%09?token=abc",
            "https://meeshy.me/auth/magic-link%C2%A0?token=abc",
            "https://meeshy.me/auth/%E3%80%80magic-link?token=abc",
            "https://meeshy.me/auth/magic%E2%80%8B-link?token=abc",
            "https://meeshy.me/auth/magic-link%20/abc",
            "https://meeshy.me/auth/magic-link/abc%20",
            "https://meeshy.me/auth/magic-link/abc/extra",
            "https://meeshy.me/auth/magic-link/validate?token=abc",
            "https://meeshy.me/auth/magic-link/?token=abc",
            "https://meeshy.me//auth/magic-link?token=abc",
            "https://meeshy.me/auth//magic-link?token=abc",
            "https://meeshy.me/x/../auth/magic-link?token=abc",
            "https://meeshy.me/./auth/magic-link?token=abc",
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me/auth%2Fmagic-link?token=abc",
            "https://meeshy.me/%61uth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-link;x=1?token=abc",
            "https://meeshy.me/auth;x/magic-link?token=abc",
            "https://meeshy.me/reset-password/x#token=abc",
            "https://meeshy.me/auth/reset-password/x#token=abc",
            "https://evil.example%5C@meeshy.me/auth/magic-link?token=abc",
            "https://user:pass@meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me:8443/auth/magic-link?token=abc",
            "http://meeshy.me/auth/magic-link?token=abc",
        ].forEach { raw in
            guard let url = URL(string: raw) else { return XCTFail("Foundation refuse \(raw) : le témoin ne l'éprouve pas") }
            XCTAssertFalse(isSignIn(parse(raw)), raw)
            XCTAssertFalse(DeepLinkParser.isMeeshyDeepLink(url), "le système rend \(raw) à Safari")
        }
    }

    func test_pathRule_mirrorsTheSharedRule() {
        [
            "/auth/magic-link", "/auth/magic-link/validate", "/auth/verify-email", "/auth/revoke-sessions",
            "/reset-password", "/account/deletion", "/settings/verify-email-change",
            "/auth/email-link/magic-link", "/auth/email-link/whatever", "/auth/reset-password",
            "/AUTH/Magic-Link", "//auth///magic-link", "/auth/magic-link/", "/auth%2Fmagic-link",
            "/%61uth/magic-link", "/x/../auth/magic-link", "/auth\\magic-link", "/auth/magic-link%20",
            "/auth/magic-link%C2%A0", "/auth/%E3%80%80magic-link", "/auth/%C2%85magic-link",
            "/auth/verify-email/x", "/auth/magic-link;x=1", "/auth;x/magic-link", "/auth%252Fmagic-link",
            "/auth/magic%E2%80%8B-link", "/auth/magic-link%3Ftoken=abc",
        ].forEach { XCTAssertTrue(EmailLinkSecret.carriesSecret(path: $0), $0) }
        ["/", "/chat/abc", "/auth/login", "/auth/magic-linker", "/blog/reset-password-tips"]
            .forEach { XCTAssertFalse(EmailLinkSecret.carriesSecret(path: $0), $0) }
    }
}
