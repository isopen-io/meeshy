import XCTest
@testable import Meeshy
import MeeshySDK

/// Le lien de parrainage de la carte partagée (#7742) : la règle de choix du jeton (miroir de
/// `loadShareableReferralLink` du web), la carte qui l'écrit court, et le service cache-first.
@MainActor
final class GameReferralCardTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func token(
        _ code: String = "AMANI7", link: String? = "https://meeshy.me/signup/affiliate/AMANI7",
        maxUses: Int? = nil, uses: Int = 0, active: Bool = true, expiresAt: String? = nil
    ) -> AffiliateToken {
        AffiliateToken(
            id: "id-\(code)", token: code, name: "Invitation Meeshy", affiliateLink: link,
            maxUses: maxUses, currentUses: uses, isActive: active, expiresAt: expiresAt,
            createdAt: "2026-10-01T00:00:00.000Z", _count: nil, clickCount: 0
        )
    }

    // MARK: - La carte

    func test_displayLink_dropsTheSchemeAndTheTrailingSlash() {
        XCTAssertEqual(ReferralCard(link: "https://meeshy.me/signup/affiliate/AMANI7/", flame: nil).displayLink,
                       "meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(ReferralCard(link: "HTTP://meeshy.me/x", flame: nil).displayLink, "meeshy.me/x")
    }

    func test_thePlaceholder_isNamedAsSuch_andIsNeverTheLinkOfAToken() {
        let placeholder = ReferralCard.placeholder(flame: nil)
        XCTAssertTrue(placeholder.isPlaceholder)
        XCTAssertEqual(placeholder.displayLink, "meeshy.me/r/…")
        XCTAssertFalse(ReferralCard(link: "https://meeshy.me/signup/affiliate/AMANI7", flame: nil).isPlaceholder)
        XCTAssertTrue(placeholder.withFlame(.init(form: .braise, days: 3)).isPlaceholder, "la Flamme ne change pas la nature du lien")
    }

    func test_aFlameThatIsOutOrWithoutStreak_isNotShown() {
        func flame(days: Int, status: FlameStatus, form: FlameFormKey? = .braise) -> GameBlock.Flame {
            GameBlock.Flame(days: days, form: form, bonusPercent: 0, freezes: 0, maxFreezes: 2,
                            freezePrice: 50, relightPrice: 100, status: status, canRelight: false)
        }
        XCTAssertNotNil(ReferralCard.Flame(game: flame(days: 23, status: .lit)))
        XCTAssertNil(ReferralCard.Flame(game: flame(days: 0, status: .lit)))
        XCTAssertNil(ReferralCard.Flame(game: flame(days: 23, status: .out)))
        XCTAssertNil(ReferralCard.Flame(game: flame(days: 23, status: .lit, form: nil)))
    }

    // MARK: - La règle

    func test_theFirstUsableTokenWins() {
        let tokens = [token("OLD", link: "https://meeshy.me/signup/affiliate/OLD", active: false), token()]
        XCTAssertEqual(ReferralLinkRule.link(in: tokens, now: now), "https://meeshy.me/signup/affiliate/AMANI7")
    }

    func test_anExpiredToken_isNeverShared_andAnUnreadableDateIsNotAnOpenEnd() {
        XCTAssertFalse(ReferralLinkRule.isUsable(token(expiresAt: "2026-01-01T00:00:00.000Z"), now: now))
        XCTAssertFalse(ReferralLinkRule.isUsable(token(expiresAt: "pas une date"), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(expiresAt: "2099-01-01T00:00:00.000Z"), now: now))
    }

    func test_anExhaustedToken_isNeverShared_andZeroMeansUnlimited() {
        XCTAssertFalse(ReferralLinkRule.isUsable(token(maxUses: 5, uses: 5), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(maxUses: 5, uses: 4), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(maxUses: 0, uses: 99), now: now))
        XCTAssertTrue(ReferralLinkRule.isUsable(token(maxUses: nil, uses: 99), now: now))
    }

    func test_aTokenWithoutALink_isNeverShared() {
        XCTAssertFalse(ReferralLinkRule.isUsable(token(link: nil), now: now))
        XCTAssertFalse(ReferralLinkRule.isUsable(token(link: ""), now: now))
    }

    // MARK: - Le service : cache d'abord, réseau ensuite, création en dernier

    private func makeService(_ gateway: MockReferralTokenGateway) -> ReferralLinkService {
        ReferralLinkService(gateway: gateway, now: { self.now })
    }

    func test_aUsableCachedToken_answersWithoutTheNetwork() async {
        let gateway = MockReferralTokenGateway()
        gateway.cached = [token()]
        let link = await makeService(gateway).shareableLink()
        XCTAssertEqual(link, "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(gateway.listCalls, 0)
    }

    func test_withNothingCached_theListIsReadAndStored() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([token()])
        let link = await makeService(gateway).shareableLink()
        XCTAssertEqual(link, "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(gateway.stored.count, 1)
        XCTAssertTrue(gateway.createdNames.isEmpty)
    }

    func test_withNoUsableToken_theFirstShareCreatesOne() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        gateway.created = .success(token("NEW", link: "https://meeshy.me/signup/affiliate/NEW"))
        let link = await makeService(gateway).shareableLink()
        XCTAssertEqual(link, "https://meeshy.me/signup/affiliate/NEW")
        XCTAssertEqual(gateway.createdNames, [ReferralLinkRule.tokenName])
    }

    // MARK: - Lire n'est pas créer (#7742)

    func test_existingLink_withNoUsableToken_createsNothing() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        gateway.created = .success(token("NEW", link: "https://meeshy.me/signup/affiliate/NEW"))
        let link = await makeService(gateway).existingLink()
        XCTAssertNil(link)
        XCTAssertEqual(gateway.listCalls, 1)
        XCTAssertTrue(gateway.createdNames.isEmpty, "ouvrir le déroulé ne crée aucun jeton")
    }

    func test_existingLink_answersFromTheCacheOrTheList() async {
        let cachedGateway = MockReferralTokenGateway()
        cachedGateway.cached = [token()]
        let cached = await makeService(cachedGateway).existingLink()
        XCTAssertEqual(cached, "https://meeshy.me/signup/affiliate/AMANI7")
        XCTAssertEqual(cachedGateway.listCalls, 0)

        let listedGateway = MockReferralTokenGateway()
        listedGateway.listed = .success([token("LISTED", link: "https://meeshy.me/signup/affiliate/LISTED")])
        let listed = await makeService(listedGateway).existingLink()
        XCTAssertEqual(listed, "https://meeshy.me/signup/affiliate/LISTED")
        XCTAssertTrue(listedGateway.createdNames.isEmpty)
    }

    func test_existingLink_afterAFailedRead_givesNoLink_andCreatesNothing() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .failure(MockReferralError.refused)
        gateway.created = .success(token("NEW"))
        let link = await makeService(gateway).existingLink()
        XCTAssertNil(link)
        XCTAssertTrue(gateway.createdNames.isEmpty)
    }

    func test_aFailedRead_createsNothingAtRandom_andGivesNoLink() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .failure(MockReferralError.refused)
        let link = await makeService(gateway).shareableLink()
        XCTAssertNil(link)
        XCTAssertTrue(gateway.createdNames.isEmpty)
    }

    func test_aRefusedCreation_givesNoLink() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        let link = await makeService(gateway).shareableLink()
        XCTAssertNil(link)
    }

    func test_aCreatedTokenTheServerCallsUnusable_isNotShared() async {
        let gateway = MockReferralTokenGateway()
        gateway.listed = .success([])
        gateway.created = .success(token("NEW", active: false))
        let link = await makeService(gateway).shareableLink()
        XCTAssertNil(link)
    }
}
