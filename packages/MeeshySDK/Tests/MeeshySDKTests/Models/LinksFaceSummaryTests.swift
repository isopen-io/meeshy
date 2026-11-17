import Foundation
import Testing
@testable import MeeshySDK

/// « Liens créés » de la face Liens (#18871, planche `Moi-Liens`) : les quatre familles en billets, avec leur
/// chiffre, dans l'ordre des filtres.
struct LinksFaceSummaryTests {

    private func share(id: String = "s1", uses: Int = 23, cap: Int? = 50, active: Bool = true,
                       expiresAt: Date? = nil) -> MyShareLink {
        MyShareLink(id: id, linkId: "mshy_\(id)", identifier: nil, name: "Studio — invités", isActive: active,
                    currentUses: uses, maxUses: cap, expiresAt: expiresAt, createdAt: Date(timeIntervalSince1970: 0),
                    conversationTitle: nil)
    }

    private func tracking(id: String = "t1", clicks: Int = 1284) throws -> TrackingLink {
        let json = """
        {"id":"\(id)","token":"dkr-nuit","name":"Réel Dakar la nuit","originalUrl":"https://a.io",
         "shortUrl":"https://meeshy.me/l/dkr-nuit","totalClicks":\(clicks),"uniqueClicks":3,"isActive":true,"createdAt":0}
        """
        return try JSONDecoder().decode(TrackingLink.self, from: Data(json.utf8))
    }

    private func community(members: Int = 342) -> CommunityLink {
        CommunityLink(id: "c1", name: "Beatmakers Dakar", identifier: "beatmakers", baseUrl: "https://meeshy.me",
                      memberCount: members, isActive: true, createdAt: Date(timeIntervalSince1970: 0))
    }

    private func referral(referrals: Int = 14) -> AffiliateToken {
        AffiliateToken(id: "r1", token: "AISSA-7K2", name: "Parrainage", affiliateLink: nil, maxUses: nil,
                       currentUses: 0, isActive: true, expiresAt: nil, createdAt: "2026-01-01",
                       _count: AffiliateCount(affiliations: referrals), clickCount: 0)
    }

    @Test func theFourFamiliesComeInTheOrderOfTheFilters() throws {
        let summary = LinksFaceSummary(share: [share()], tracking: [try tracking()], community: [community()],
                                       referral: [referral()])
        #expect(summary.tickets.map(\.family) == [.share, .tracking, .community, .referral])
    }

    @Test func eachTicketCarriesItsFigure() throws {
        let summary = LinksFaceSummary(share: [share()], tracking: [try tracking()], community: [community()],
                                       referral: [referral()])
        #expect(summary.tickets.map(\.figure) == [.arrivals(23, cap: 50), .clicks(1284), .members(342), .referrals(14)])
    }

    @Test func theAddressIsReadWithoutSchemeAndCopiedWhole() throws {
        let summary = LinksFaceSummary(tracking: [try tracking()], community: [community()])
        #expect(summary.tickets.map(\.code) == ["meeshy.me/l/dkr-nuit", "meeshy.me/chat/beatmakers"])
        #expect(summary.tickets.map(\.copyValue) == ["https://meeshy.me/l/dkr-nuit", "https://meeshy.me/chat/beatmakers"])
    }

    @Test func aReferralWithoutLinkShowsItsCode() {
        let summary = LinksFaceSummary(referral: [referral()])
        #expect(summary.tickets.first?.code == "AISSA-7K2")
        #expect(summary.tickets.first?.copyValue == "AISSA-7K2")
    }

    @Test func aCappedLinkSaysHowFullItIs() {
        #expect(LinksFaceFigure.arrivals(23, cap: 50).fill == 0.46)
        #expect(LinksFaceFigure.arrivals(80, cap: 50).fill == 1)
        #expect(LinksFaceFigure.arrivals(3, cap: nil).fill == nil)
        #expect(LinksFaceFigure.clicks(3).fill == nil)
    }

    @Test func theActiveCountLeavesOutPausedAndExpiredLinks() {
        let now = Date(timeIntervalSince1970: 1_000)
        let summary = LinksFaceSummary(share: [
            share(id: "a"),
            share(id: "b", active: false),
            share(id: "c", expiresAt: Date(timeIntervalSince1970: 10)),
            share(id: "d", expiresAt: Date(timeIntervalSince1970: 5_000)),
        ])
        #expect(summary.activeCount(now: now) == 2)
    }

    @Test func aFamilyNotYetReadIsNeitherCountedNorOffered() {
        let summary = LinksFaceSummary(share: [share()], community: [])
        #expect(summary.loadedFamilies == [.share, .community])
        #expect(summary.filters == [.all, .family(.share)])
        #expect(summary.tickets(for: .family(.community)).isEmpty)
    }

    @Test func aFilterKeepsOnlyItsFamily() throws {
        let summary = LinksFaceSummary(share: [share()], tracking: [try tracking()])
        #expect(summary.tickets(for: .family(.tracking)).map(\.title) == ["Réel Dakar la nuit"])
        #expect(summary.tickets(for: .all).count == 2)
    }
}
