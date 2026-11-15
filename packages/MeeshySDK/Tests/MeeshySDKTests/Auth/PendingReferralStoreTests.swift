import XCTest
@testable import MeeshySDK

/// #8075 — le code d'invitation, entre l'ouverture du lien et l'inscription.
///
/// Même contrat que la mémoire du web (`apps/web/src/lib/view/referral-memory.ts`) :
/// un code bien formé survit trente jours, un code mal formé n'efface rien,
/// et seule `forget()` efface — une fois le compte créé.
final class PendingReferralStoreTests: XCTestCase {

    private final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private func makeSUT(clock: Clock = Clock()) -> (sut: PendingReferralStore, defaults: UserDefaults, clock: Clock) {
        let suite = "PendingReferralStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let sut = PendingReferralStore(defaults: defaults, now: { clock.now })
        return (sut, defaults, clock)
    }

    func test_recall_nothingRemembered_isNil() {
        let (sut, _, _) = makeSUT()
        XCTAssertNil(sut.recall())
    }

    func test_remember_thenRecall_returnsTheTrimmedCode() {
        let (sut, _, _) = makeSUT()
        sut.remember("  aff_1234567890_abc \n")
        XCTAssertEqual(sut.recall(), "aff_1234567890_abc")
    }

    func test_remember_survivesANewStoreOnTheSameDefaults() {
        let (sut, defaults, clock) = makeSUT()
        sut.remember("ref_abc")
        let relaunched = PendingReferralStore(defaults: defaults, now: { clock.now })
        XCTAssertEqual(relaunched.recall(), "ref_abc", "le code survit à un relancement de l'app")
    }

    func test_recall_afterThirtyDays_isNilAndForgotten() {
        let (sut, defaults, clock) = makeSUT()
        sut.remember("aff_old")
        clock.now = clock.now.addingTimeInterval(30 * 24 * 3600 + 1)
        XCTAssertNil(sut.recall())
        clock.now = clock.now.addingTimeInterval(-10 * 24 * 3600)
        XCTAssertNil(PendingReferralStore(defaults: defaults, now: { clock.now }).recall(),
                     "un code expiré est EFFACÉ, pas seulement masqué")
    }

    func test_recall_justBeforeThirtyDays_isStillThere() {
        let (sut, _, clock) = makeSUT()
        sut.remember("aff_young")
        clock.now = clock.now.addingTimeInterval(30 * 24 * 3600 - 60)
        XCTAssertEqual(sut.recall(), "aff_young")
    }

    func test_remember_malformedCode_keepsTheCodeAlreadyRemembered() {
        let (sut, _, _) = makeSUT()
        sut.remember("aff_good")
        sut.remember("   ")
        sut.remember("deux mots")
        sut.remember(String(repeating: "x", count: 129))
        XCTAssertEqual(sut.recall(), "aff_good")
    }

    func test_remember_newerCode_replacesTheOlderOne() {
        let (sut, _, _) = makeSUT()
        sut.remember("aff_first")
        sut.remember("aff_second")
        XCTAssertEqual(sut.recall(), "aff_second", "le dernier lien ouvert gagne, comme sur le web")
    }

    func test_forget_erasesTheCode() {
        let (sut, _, _) = makeSUT()
        sut.remember("aff_x")
        sut.forget()
        XCTAssertNil(sut.recall())
    }

    func test_recall_corruptedRow_isNil() {
        let (sut, defaults, _) = makeSUT()
        defaults.set(Data("pas du json".utf8), forKey: PendingReferralStore.storageKey)
        XCTAssertNil(sut.recall())
    }

    // MARK: - Forme d'un code

    func test_referralCode_normalized() {
        XCTAssertEqual(ReferralCode.normalized(" ref_ABC "), "ref_ABC", "la casse est conservée : un jeton est opaque")
        XCTAssertNil(ReferralCode.normalized(""))
        XCTAssertNil(ReferralCode.normalized("a b"))
        XCTAssertNil(ReferralCode.normalized(String(repeating: "y", count: 129)))
        XCTAssertEqual(ReferralCode.normalized(String(repeating: "y", count: 128))?.count, 128)
    }

    // MARK: - La charge d'inscription

    private func encoded(_ request: RegisterRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_registerRequest_referredByCode_carriesAffiliateToken() throws {
        let request = RegisterRequest(email: "a@b.co").referred(byCode: " aff_42 ")
        let dict = try encoded(request)
        XCTAssertEqual(dict["affiliateToken"] as? String, "aff_42")
        XCTAssertNil(dict["affiliateSessionKey"], "aucune clé de session connue ⇒ aucune clé envoyée")
        XCTAssertEqual(dict["email"] as? String, "a@b.co", "le reste de la charge est intact")
    }

    func test_registerRequest_referredWithSessionKey_carriesBoth() throws {
        let dict = try encoded(RegisterRequest(email: "a@b.co").referred(byCode: "aff_42", sessionKey: "sess_1"))
        XCTAssertEqual(dict["affiliateToken"] as? String, "aff_42")
        XCTAssertEqual(dict["affiliateSessionKey"] as? String, "sess_1")
    }

    func test_registerRequest_withoutCode_omitsBothKeys() throws {
        for request in [RegisterRequest(email: "a@b.co"),
                        RegisterRequest(email: "a@b.co").referred(byCode: nil, sessionKey: "sess_1"),
                        RegisterRequest(email: "a@b.co").referred(byCode: "  ")] {
            let dict = try encoded(request)
            XCTAssertNil(dict["affiliateToken"])
            XCTAssertNil(dict["affiliateSessionKey"], "une clé de session sans code n'a rien à rattacher")
        }
    }

    func test_registerRequest_referred_keepsThePhone() throws {
        let request = RegisterRequest(email: "a@b.co", phoneNumber: "0612345678", phoneCountryCode: "FR",
                                      username: "awa").referred(byCode: "aff_42")
        let dict = try encoded(request)
        XCTAssertEqual(dict["phoneNumber"] as? String, "0612345678")
        XCTAssertEqual(dict["phoneCountryCode"] as? String, "FR")
        XCTAssertEqual(dict["username"] as? String, "awa")
        XCTAssertEqual(dict["affiliateToken"] as? String, "aff_42")
    }
}
