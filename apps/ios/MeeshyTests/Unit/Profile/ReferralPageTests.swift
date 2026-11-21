import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// La page Parrainage de la planche (#19507) : ce qu'elle montre selon ce que la passerelle sert — et ce qu'elle
/// tait quand la passerelle ne le sert pas — puis ses gestes (relancer, inviter, dire bonjour).
@MainActor
final class ReferralPageTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_795_000_000)

    private func token(id: String = "t1", code: String = "AISSA-7K2", active: Bool = true, clicks: Int = 0,
                       link: String? = "https://meeshy.me/signup/affiliate/AISSA-7K2") -> AffiliateToken {
        AffiliateToken(id: id, token: code, name: "Invitation Meeshy", affiliateLink: link, maxUses: nil, currentUses: 0,
                       isActive: active, expiresAt: nil, createdAt: "2026-10-01T08:00:00.000Z", _count: nil,
                       clickCount: clicks)
    }

    private func referral(_ id: String, status: String = "completed", activity: String? = nil,
                          userId: String? = "u1") -> AffiliateReferral {
        AffiliateReferral(id: id, status: status, createdAt: now.addingTimeInterval(-3 * 86_400),
                          referredUser: userId.map { ReferredUser(id: $0, username: "koffi_beats") },
                          activity: activity)
    }

    private func invitation(_ id: String, state: String = "sent", canResend: Bool? = true,
                            resendsLeft: Int? = 3) -> SentEmailInvitation {
        SentEmailInvitation(id: id, maskedEmail: "ma•••••@gmail.com", sentAt: "2026-11-14T09:00:00.000Z", state: state,
                            resendsLeft: resendsLeft, canResend: canResend)
    }

    private func page(tokens: [AffiliateToken] = [], stats: AffiliateStats? = nil, cached: [AffiliateReferral] = [],
                      invitations: [SentEmailInvitation] = []) -> ReferralPage {
        ReferralPage.compose(tokens: tokens, stats: stats, cachedReferrals: cached, invitations: invitations, now: now)
    }

    // MARK: - Ton code

    func test_hero_isTheFirstUsableToken_withItsCodeAndItsLinkWithoutScheme() throws {
        let hero = try XCTUnwrap(page(tokens: [token(id: "off", code: "OLD", active: false), token()]).hero)
        XCTAssertEqual(hero.code, "AISSA-7K2")
        XCTAssertEqual(hero.displayLink, "meeshy.me/signup/affiliate/AISSA-7K2")
        XCTAssertEqual(hero.url?.absoluteString, "https://meeshy.me/signup/affiliate/AISSA-7K2")
    }

    func test_hero_withoutAnyUsableToken_isAbsent() {
        XCTAssertNil(page(tokens: [token(active: false), token(id: "t2", link: nil)]).hero)
    }

    // MARK: - Les chiffres

    func test_figures_whenTheGatewayServesTheFunnel_sayReferralsVisitsAndThisMonth() {
        let stats = AffiliateStats(totalReferrals: 14, visits: 38, registrations: 17, registrationsThisMonth: 9)
        XCTAssertEqual(page(tokens: [token(clicks: 2)], stats: stats).figures, [
            ReferralPage.Figure(kind: .referrals, value: 14),
            ReferralPage.Figure(kind: .visits, value: 38),
            ReferralPage.Figure(kind: .thisMonth, value: 9)
        ])
    }

    func test_figures_onAnOlderGateway_countTokenClicks_andInventNoMonth() {
        let figures = page(tokens: [token(clicks: 5), token(id: "t2", clicks: 7)], cached: [referral("r1")]).figures
        XCTAssertEqual(figures, [
            ReferralPage.Figure(kind: .referrals, value: 1),
            ReferralPage.Figure(kind: .visits, value: 12)
        ])
    }

    func test_figures_withoutTokensNorStats_sayOnlyTheReferralCount() {
        XCTAssertEqual(page().figures, [ReferralPage.Figure(kind: .referrals, value: 0)])
    }

    // MARK: - Du lien au filleul

    func test_funnel_readsItsRatesBetweenStages() throws {
        let stats = AffiliateStats(visits: 38, registrations: 17, active: 14)
        let funnel = try XCTUnwrap(page(stats: stats).funnel)
        XCTAssertEqual(funnel.signupRate, 45)
        XCTAssertEqual(funnel.retentionRate, 82)
    }

    func test_funnel_isAbsent_whenTheGatewayServesNoVisitsOrNoRegistrations() {
        XCTAssertNil(page(stats: AffiliateStats(totalReferrals: 3)).funnel)
        XCTAssertNil(page(stats: AffiliateStats(visits: 4)).funnel)
    }

    func test_funnel_withoutMeasuredActivity_hasTwoStagesAndNoRetention() {
        let funnel = ReferralPage.Funnel(visits: 10, registrations: 2, active: nil)
        XCTAssertNil(funnel.retentionRate)
        let points = AffiliateView.funnelPoints(funnel)
        XCTAssertEqual(points.map(\.id), ["visits", "registrations"])
        XCTAssertEqual(points.first?.hop, ReferralCopy.signupHop(20))
        XCTAssertNil(points.last?.hop)
    }

    func test_funnelPoints_carryTheirHops_andSpeakThem() {
        let points = AffiliateView.funnelPoints(ReferralPage.Funnel(visits: 38, registrations: 17, active: 14))
        XCTAssertEqual(points.map(\.value), [38, 17, 14])
        XCTAssertEqual(points.map(\.hop), [ReferralCopy.signupHop(45), ReferralCopy.retentionHop(82), nil])
        let spoken = points[0].spoken
        XCTAssertTrue(spoken.contains(ReferralCopy.signupHop(45)), spoken)
    }

    func test_rate_saysNothingWithoutWhole_orWhenThePartExceedsIt() {
        XCTAssertNil(ReferralPage.rate(3, of: 0))
        XCTAssertNil(ReferralPage.rate(5, of: 4))
        XCTAssertEqual(ReferralPage.rate(1, of: 3), 33)
        XCTAssertEqual(ReferralPage.rate(0, of: 3), 0)
    }

    // MARK: - Ce que ça te rapporte, le palier

    func test_reward_andTier_areAbsent_untilTheGameServesThem() {
        let shown = page(stats: AffiliateStats(visits: 1, registrations: 1))
        XCTAssertNil(shown.reward)
        XCTAssertNil(shown.tier)
    }

    func test_reward_andTier_whenServed_readTheGainTheTotalAndTheGauge() throws {
        let rewards = AffiliateRewards(perActiveReferral: 50, earned: 700,
                                       nextTier: AffiliateRewardTier(reached: 14, target: 15, reward: "Contour Parrain"))
        let shown = page(stats: AffiliateStats(rewards: rewards))
        let reward = try XCTUnwrap(shown.reward)
        XCTAssertEqual(reward, ReferralPage.Reward(perActiveReferral: 50, earned: 700))
        let tier = try XCTUnwrap(shown.tier)
        XCTAssertEqual(tier.fraction, 14.0 / 15.0, accuracy: 0.0001)
        XCTAssertEqual(AffiliateView.tierCaption(tier), "\(ReferralCopy.tierCaption(15)) : Contour Parrain")
        XCTAssertEqual(AffiliateView.rewardTitle(reward), ReferralCopy.perActive(50))
        XCTAssertEqual(AffiliateView.rewardSubtitle(reward), ReferralCopy.earned(700))
    }

    func test_tier_withoutTarget_isAbsent_andAGaugeNeverOverflows() {
        XCTAssertNil(ReferralPage.tier(AffiliateRewardTier(reached: 3, target: 0)))
        XCTAssertEqual(ReferralPage.tier(AffiliateRewardTier(reached: 20, target: 15))?.fraction, 1)
    }

    // MARK: - Tes filleuls

    func test_referralStatus_readsPendingExpiredAndActivity_andNeverInventsActivity() {
        XCTAssertEqual(ReferralPage.status(referral("a", status: "pending")), .pending)
        XCTAssertEqual(ReferralPage.status(referral("b", status: "expired")), .expired)
        XCTAssertEqual(ReferralPage.status(referral("c", activity: "active")), .active)
        XCTAssertEqual(ReferralPage.status(referral("d", activity: "inactive")), .inactive)
        XCTAssertEqual(ReferralPage.status(referral("e")), .joined)
    }

    func test_referrals_preferTheServedList_overTheCachedOne() {
        let stats = AffiliateStats(referrals: [referral("served")])
        XCTAssertEqual(page(stats: stats, cached: [referral("cached")]).referrals.map(\.id), ["served"])
        XCTAssertEqual(page(cached: [referral("cached")]).referrals.map(\.id), ["cached"])
    }

    func test_sayHello_isOfferedOnlyTowardAnExistingAccount() {
        XCTAssertTrue(ReferralPage.referral(referral("a")).canSayHello)
        XCTAssertFalse(ReferralPage.referral(referral("b", userId: nil)).canSayHello)
    }

    // MARK: - Invitations envoyées

    func test_invitationLine_saysWhenItWasSent_andItsState() {
        let line = AffiliateView.invitationLine(invitation("i", state: "opened"))
        XCTAssertTrue(line.contains(ReferralCopy.openedNotJoined), line)
        XCTAssertNotEqual(line, ReferralCopy.openedNotJoined)
    }

    func test_invitationLine_withoutAReadableDate_saysOnlyItsState() {
        let undated = SentEmailInvitation(id: "i", maskedEmail: "a•••••@b.c", sentAt: "hier", state: "sent")
        XCTAssertEqual(AffiliateView.invitationLine(undated), ReferralCopy.notOpened)
    }

    // MARK: - Gestes

    private func makeSUT(invitations: Result<[SentEmailInvitation], Error> = .success([]),
                         resend: Result<SentEmailInvitation, Error>? = nil,
                         sendError: Error? = nil,
                         deleteError: Error? = nil,
                         store: MemoryAffiliateStore = MemoryAffiliateStore(),
                         service: MockAffiliateService = MockAffiliateService())
        -> (AffiliateViewModel, StubSentInvitations, MockConversationCreator) {
        let stub = StubSentInvitations(list: invitations, resend: resend)
        let creator = MockConversationCreator()
        let sources = AffiliatePageSources(
            affiliateService: service, invitationsService: stub,
            deleteToken: { _ in if let deleteError { throw deleteError } },
            sendEmailInvitation: { _ in if let sendError { throw sendError } },
            conversationCreator: creator, currentUserId: "me", store: store)
        let sut = AffiliateViewModel(sources: sources, now: { [now] in now })
        return (sut, stub, creator)
    }

    func test_load_whenTheCacheIsFresh_showsItAndAsksNothing() async {
        let store = MemoryAffiliateStore(tokens: [token()], isFresh: true)
        let service = MockAffiliateService()
        let (sut, _, _) = makeSUT(store: store, service: service)

        await sut.load()

        XCTAssertEqual(sut.tokens.map(\.id), ["t1"])
        XCTAssertEqual(service.listTokensCallCount, 0)
        XCTAssertFalse(sut.isLoading)
    }

    func test_load_whenTheCacheIsStale_showsItThenRevalidates() async {
        let store = MemoryAffiliateStore(tokens: [token(id: "old")], isFresh: false)
        let service = MockAffiliateService()
        service.listTokensResult = .success([token(id: "new")])
        let (sut, _, _) = makeSUT(store: store, service: service)

        await sut.load()

        XCTAssertEqual(sut.tokens.map(\.id), ["new"])
        XCTAssertEqual(store.savedTokens?.map(\.id), ["new"])
    }

    func test_loadPage_showsCachedReferrals_thenTheServedOnes_andKeepsThem() async {
        let store = MemoryAffiliateStore(referrals: [referral("cached")])
        let service = MockAffiliateService()
        service.fetchStatsResult = .success(AffiliateStats(referrals: [referral("served")], visits: 3, registrations: 1))
        let (sut, _, _) = makeSUT(store: store, service: service)

        await sut.loadPage()

        XCTAssertEqual(sut.page.referrals.map(\.id), ["served"])
        XCTAssertEqual(store.savedReferrals?.map(\.id), ["served"])
        XCTAssertNotNil(sut.page.funnel)
        XCTAssertEqual(sut.statsPhase, .loaded)
    }

    func test_loadPage_whenStatsFail_keepsTheCachedReferrals_andSaysStatsUnavailable() async {
        let store = MemoryAffiliateStore(referrals: [referral("cached")])
        let service = MockAffiliateService()
        service.fetchStatsResult = .failure(StubError.refused)
        let (sut, _, _) = makeSUT(store: store, service: service)

        await sut.loadPage()

        XCTAssertEqual(sut.page.referrals.map(\.id), ["cached"])
        XCTAssertNil(sut.page.funnel)
        XCTAssertEqual(sut.statsPhase, .unavailable)
    }

    func test_deleteToken_removesTheRowAtOnce_andRestoresItOnRefusal() async {
        let store = MemoryAffiliateStore(tokens: [token(), token(id: "t2")], isFresh: true)
        let (sut, _, _) = makeSUT(deleteError: StubError.refused, store: store)
        await sut.load()

        let ok = await sut.deleteToken(token())

        XCTAssertFalse(ok)
        XCTAssertEqual(sut.tokens.map(\.id), ["t1", "t2"])
    }

    func test_resend_closesTheButtonAtOnce_thenAdoptsTheServedInvitation() async {
        let served = SentEmailInvitation(id: "i1", maskedEmail: "ma•••••@gmail.com", state: "sent", resendsLeft: 2,
                                         canResend: false, nextResendAt: "2026-11-21T09:00:00.000Z")
        let (sut, stub, _) = makeSUT(invitations: .success([invitation("i1")]), resend: .success(served))
        await sut.refreshInvitations()

        let ok = await sut.resend(invitation("i1"))

        XCTAssertTrue(ok)
        XCTAssertEqual(stub.resentIds, ["i1"])
        XCTAssertEqual(sut.invitations, [served])
    }

    func test_resend_whenTheGatewayRefuses_restoresTheInvitation() async {
        let (sut, _, _) = makeSUT(invitations: .success([invitation("i1")]), resend: .failure(StubError.refused))
        await sut.refreshInvitations()

        let ok = await sut.resend(invitation("i1"))

        XCTAssertFalse(ok)
        XCTAssertEqual(sut.invitations, [invitation("i1")])
    }

    func test_resend_whenTheInvitationCannotBeResent_sendsNothing() async {
        let (sut, stub, _) = makeSUT(invitations: .success([invitation("i1", canResend: false)]))
        await sut.refreshInvitations()

        let ok = await sut.resend(invitation("i1", canResend: false))

        XCTAssertFalse(ok)
        XCTAssertTrue(stub.resentIds.isEmpty)
    }

    func test_invitations_onAnOlderGateway_stayAbsent() async {
        let (sut, _, _) = makeSUT(invitations: .failure(StubError.refused))
        await sut.refreshInvitations()
        XCTAssertTrue(sut.invitations.isEmpty)
    }

    func test_invite_sendsAPlausibleAddress_thenRereadsTheMaskedList() async {
        let (sut, stub, _) = makeSUT(invitations: .success([invitation("i9")]))

        let ok = await sut.invite(email: "  marie@gmail.com ")

        XCTAssertTrue(ok)
        XCTAssertEqual(stub.listCount, 1)
        XCTAssertEqual(sut.invitations.map(\.maskedEmail), ["ma•••••@gmail.com"])
    }

    func test_invite_refusesWhatCannotBeAnAddress_orWhatTheGatewayRefuses() async {
        let (sut, stub, _) = makeSUT(sendError: StubError.refused)
        let malformed = await sut.invite(email: "marie")
        let refused = await sut.invite(email: "marie@gmail.com")
        XCTAssertFalse(malformed)
        XCTAssertFalse(refused)
        XCTAssertEqual(stub.listCount, 0)
    }

    func test_plausibleEmail_needsALocalPartAnAtAndADottedDomain() {
        XCTAssertTrue(ReferralInviteRule.isPlausibleEmail("a@b.co"))
        XCTAssertFalse(ReferralInviteRule.isPlausibleEmail("@b.co"))
        XCTAssertFalse(ReferralInviteRule.isPlausibleEmail("a@b"))
        XCTAssertFalse(ReferralInviteRule.isPlausibleEmail("a@b."))
        XCTAssertFalse(ReferralInviteRule.isPlausibleEmail("a b@c.de"))
        XCTAssertFalse(ReferralInviteRule.isPlausibleEmail("a@b@c.de"))
    }

    func test_sayHello_opensTheDirectConversationWithTheReferral() async {
        let (sut, _, creator) = makeSUT()
        let conversation = await sut.sayHello(to: ReferralPage.referral(referral("r1", userId: "u7")))
        XCTAssertNotNil(conversation)
        XCTAssertEqual(creator.lastUserId, "u7")
        XCTAssertEqual(creator.lastCurrentUserId, "me")
    }
}

private enum StubError: Error {
    case refused
}

private final class StubSentInvitations: SentInvitationsProviding, @unchecked Sendable {
    nonisolated deinit {}

    let list: Result<[SentEmailInvitation], Error>
    let resend: Result<SentEmailInvitation, Error>?
    private(set) var resentIds: [String] = []
    private(set) var listCount = 0

    init(list: Result<[SentEmailInvitation], Error>, resend: Result<SentEmailInvitation, Error>?) {
        self.list = list
        self.resend = resend
    }

    func listSentInvitations(offset: Int, limit: Int) async throws -> [SentEmailInvitation] {
        listCount += 1
        return try list.get()
    }

    func resendInvitation(id: String) async throws -> SentEmailInvitation {
        resentIds.append(id)
        guard let resend else { throw StubError.refused }
        return try resend.get()
    }
}

@MainActor
private final class MemoryAffiliateStore: AffiliatePageCacheProviding {
    nonisolated deinit {}

    private let tokens: [AffiliateToken]?
    private let isFresh: Bool
    private let referrals: [AffiliateReferral]
    private(set) var savedTokens: [AffiliateToken]?
    private(set) var savedReferrals: [AffiliateReferral]?

    init(tokens: [AffiliateToken]? = nil, isFresh: Bool = false, referrals: [AffiliateReferral] = []) {
        self.tokens = tokens
        self.isFresh = isFresh
        self.referrals = referrals
    }

    func cachedTokens() async -> (tokens: [AffiliateToken], isFresh: Bool)? {
        tokens.map { ($0, isFresh) }
    }

    func saveTokens(_ tokens: [AffiliateToken]) async {
        savedTokens = tokens
    }

    func cachedReferrals() async -> [AffiliateReferral] {
        referrals
    }

    func saveReferrals(_ referrals: [AffiliateReferral]) async {
        savedReferrals = referrals
    }
}
