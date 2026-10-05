import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #8075 — un lien d'invitation ouvert sur iPhone MÉMORISE son code, et
/// l'inscription le fait voyager (`affiliateToken`, #8058).
///
/// Les formes sont celles du web : `/signup/affiliate/<code>` (le lien que la
/// passerelle grave, `affiliate.ts`, `invitations.ts`) et `/signup?ref=` —
/// `parrain` et `affiliate` en alias (`REFERRAL_SEARCH_KEYS`).
@MainActor
final class ReferralLinkTests: XCTestCase {

    // MARK: - Analyse

    func test_parse_universalAffiliateLink_isReferral() {
        for raw in ["https://meeshy.me/signup/affiliate/aff_1234567890_abc",
                    "https://app.meeshy.me/signup/affiliate/aff_1234567890_abc",
                    "https://www.meeshy.me/signup/affiliate/aff_1234567890_abc/"] {
            XCTAssertEqual(DeepLinkParser.parse(URL(string: raw)!), .referral(code: "aff_1234567890_abc"), raw)
        }
    }

    func test_parse_customSchemeAffiliateLink_isReferral() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://signup/affiliate/ref_XyZ")!), .referral(code: "ref_XyZ"))
    }

    func test_parse_signupQueryKeys_inWebOrder() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "https://meeshy.me/signup?ref=aff_1")!), .referral(code: "aff_1"))
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "https://meeshy.me/signup?parrain=aff_2")!), .referral(code: "aff_2"))
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://signup?affiliate=aff_3")!), .referral(code: "aff_3"))
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "https://meeshy.me/signup?affiliate=aff_3&ref=aff_1")!),
                       .referral(code: "aff_1"), "`ref` est lu d'abord, comme sur le web")
    }

    func test_parse_signupWithoutCode_isNotAReferral() {
        for raw in ["https://meeshy.me/signup", "https://meeshy.me/signup/affiliate/%20",
                    "https://meeshy.me/signup?ref=deux%20mots", "https://meeshy.me/signup/other/aff_1"] {
            let url = URL(string: raw)!
            XCTAssertEqual(DeepLinkParser.parse(url), .external(url), raw)
        }
    }

    /// Tapé DANS l'app, l'utilisateur est connecté : le lien part dans Safari,
    /// comme avant (#8075 § 3).
    func test_inAppTap_ofReferralLink_staysInTheBrowser() {
        XCTAssertFalse(InAppLinks.opensInApp(URL(string: "https://meeshy.me/signup/affiliate/aff_1")!))
    }

    // MARK: - Lancement système

    func test_handle_referralLink_signedOut_remembersTheCodeAndOpensSignup() {
        let referrals = MockPendingReferralStore()
        let router = DeepLinkRouter(referrals: referrals, isAuthenticated: { false })

        let claimed = router.handle(url: URL(string: "https://meeshy.me/signup/affiliate/aff_42")!)

        XCTAssertTrue(claimed)
        XCTAssertEqual(referrals.code, "aff_42")
        XCTAssertEqual(router.requestedAccountEntry, .signUp, "l'invitation ouvre l'inscription")
        XCTAssertNil(router.pendingDeepLink, "aucune destination à résoudre")
    }

    func test_handle_referralLink_signedIn_changesNothing() {
        let referrals = MockPendingReferralStore()
        let router = DeepLinkRouter(referrals: referrals, isAuthenticated: { true })

        let claimed = router.handle(url: URL(string: "meeshy://signup/affiliate/aff_42")!)

        XCTAssertFalse(claimed)
        XCTAssertNil(referrals.code, "un compte déjà connecté ne se rattache à personne")
        XCTAssertNil(router.requestedAccountEntry)
        XCTAssertNil(router.pendingDeepLink)
    }

    func test_isMeeshyDeepLink_claimsTheReferralLink() {
        XCTAssertTrue(DeepLinkParser.isMeeshyDeepLink(URL(string: "https://meeshy.me/signup/affiliate/aff_42")!))
    }
}
