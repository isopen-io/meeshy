import Foundation
import Testing
@testable import MeeshySDK

/// Ce qu'un billet de « Liens créés » dit à côté de son chiffre (#19496, planche `Moi-Liens`) : la portée d'un lien de
/// suivi, sa destination, les visages d'une communauté, le QR d'un code de parrainage.
struct LinksFaceAsideTests {

    private let owner = LinksFaceOwner(username: "Aissa", webOrigin: "https://staging.meeshy.me")

    private func tracking(originalUrl: String = "https://a.io/reel", extra: String = "") throws -> TrackingLink {
        let json = """
        {"id":"t1","token":"dkr-nuit","name":"Réel Dakar la nuit","originalUrl":"\(originalUrl)",
         "shortUrl":"https://meeshy.me/l/dkr-nuit","totalClicks":1284,"uniqueClicks":3,"isActive":true,
         "createdAt":0\(extra)}
        """
        return try JSONDecoder().decode(TrackingLink.self, from: Data(json.utf8))
    }

    private func community(previews: [LinksFaceMember]?) -> CommunityLink {
        CommunityLink(id: "c1", name: "Beatmakers Dakar", identifier: "beatmakers", baseUrl: "https://meeshy.me",
                      memberCount: 342, isActive: true, createdAt: Date(timeIntervalSince1970: 0),
                      memberPreviews: previews)
    }

    private func member(_ id: String) -> LinksFaceMember {
        LinksFaceMember(id: id, name: "Membre \(id)", avatar: nil)
    }

    private func aside(of link: TrackingLink) -> LinksFaceAside? {
        LinksFaceSummary(tracking: [link], owner: owner).tickets.first?.aside
    }

    @Test func aTrackingLinkWithItsReachServedShowsItsWeekAndItsCountries() throws {
        let link = try tracking(extra: #","dailyClicks":[3,8,5,12,9,20,24],"countryCount":31"#)
        #expect(aside(of: link) == .reach(days: [3, 8, 5, 12, 9, 20, 24], countries: 31))
    }

    @Test func aTrackingLinkToMyShowcaseSaysItsDestinationFirst() throws {
        let link = try tracking(originalUrl: "https://meeshy.me/u/aissa",
                                extra: #","dailyClicks":[1,2,3],"countryCount":4"#)
        #expect(aside(of: link) == .destination(.showcase))
    }

    @Test func myShowcaseIsRecognisedOnTheWebOriginAndWithoutCase() throws {
        let link = try tracking(originalUrl: "https://www.Staging.meeshy.me/users/AISSA?ref=bio")
        #expect(aside(of: link) == .destination(.showcase))
    }

    @Test func someoneElsesShowcaseIsNotMine() throws {
        let link = try tracking(originalUrl: "https://meeshy.me/u/tomas")
        #expect(aside(of: link) == .destination(.site("meeshy.me")))
    }

    @Test func aMeeshyProfilePathOnAnotherSiteIsThatSite() throws {
        let link = try tracking(originalUrl: "https://evil.io/u/aissa")
        #expect(aside(of: link) == .destination(.site("evil.io")))
    }

    @Test func aTrackingLinkWithoutReachSaysWhereItLeads() throws {
        let toASite = try tracking()
        let toAConversation = try tracking(originalUrl: "https://meeshy.me/chat/studio")
        #expect(aside(of: toASite) == .destination(.site("a.io")))
        #expect(aside(of: toAConversation) == .destination(.conversation))
    }

    @Test func aSingleDayDrawsNoCurveAndZeroCountriesSaysNothing() throws {
        let link = try tracking(extra: #","dailyClicks":[4],"countryCount":0"#)
        #expect(aside(of: link) == .destination(.site("a.io")))
        let countriesOnly = try tracking(extra: #","countryCount":2"#)
        #expect(aside(of: countriesOnly) == .reach(days: [], countries: 2))
    }

    @Test func anUnreadableDestinationWithoutReachSaysNothing() throws {
        let unreadable = try tracking(originalUrl: "not a url")
        #expect(aside(of: unreadable) == nil)
    }

    @Test func switchingATrackingLinkKeepsItsReach() throws {
        let link = try tracking(extra: #","dailyClicks":[1,2],"countryCount":3"#)
        let paused = link.withActive(false)
        #expect(paused.dailyClicks == [1, 2])
        #expect(paused.countryCount == 3)
    }

    @Test func aCommunityShowsThreeFacesAtMost() {
        let link = community(previews: ["mo", "tr", "km", "an"].map(member))
        let shown = LinksFaceSummary(community: [link]).tickets.first?.aside
        #expect(shown == .members(["mo", "tr", "km"].map(member)))
    }

    @Test func aCommunityWithoutFacesSaysNothingBeside() {
        #expect(LinksFaceSummary(community: [community(previews: nil)]).tickets.first?.aside == nil)
        #expect(LinksFaceSummary(community: [community(previews: [])]).tickets.first?.aside == nil)
    }

    @Test func aCommunityCachedBeforeFacesStillReads() throws {
        let cached = """
        {"id":"c1","name":"Beatmakers","identifier":"beatmakers","joinUrl":"https://meeshy.me/chat/beatmakers",
         "memberCount":3,"isActive":true,"createdAt":0}
        """
        let link = try JSONDecoder().decode(CommunityLink.self, from: Data(cached.utf8))
        #expect(link.memberPreviews == nil)
        let encoded = try JSONEncoder().encode(community(previews: [member("mo")]))
        let roundTrip = try JSONDecoder().decode(CommunityLink.self, from: encoded)
        #expect(roundTrip.memberPreviews == [member("mo")])
    }

    @Test func aReferralOffersTheQROfWhatItCopies() {
        let token = AffiliateToken(id: "r1", token: "AISSA-7K2", name: "Parrainage", affiliateLink: nil, maxUses: nil,
                                   currentUses: 0, isActive: true, expiresAt: nil, createdAt: "2026-01-01",
                                   _count: AffiliateCount(affiliations: 14), clickCount: 0)
        let ticket = LinksFaceSummary(referral: [token]).tickets.first
        #expect(ticket?.aside == .codeQR("AISSA-7K2"))
    }

    @Test func aShareLinkSaysNothingBesideItsGauge() {
        let link = MyShareLink(id: "s1", linkId: "mshy_s1", identifier: nil, name: "Studio", isActive: true,
                               currentUses: 23, maxUses: 50, expiresAt: nil, createdAt: Date(timeIntervalSince1970: 0),
                               conversationTitle: nil)
        #expect(LinksFaceSummary(share: [link]).tickets.first?.aside == nil)
    }

    @Test func aStackKeepsEachFaceOnce() {
        let stack = LinksFaceMember.stack(["mo", "mo", "tr", "an", "kb"].map(member))
        #expect(stack.map(\.id) == ["mo", "tr", "an"])
    }

    @Test func anArrivalBecomesAFace() {
        let arrival = ShareLinkArrivalStats.Arrival(participantId: "p1", displayName: "Mina Okafor",
                                                    avatar: "https://cdn/m.png", isAnonymous: false,
                                                    joinedAt: Date(timeIntervalSince1970: 0))
        #expect(LinksFaceMember(arrival: arrival) == LinksFaceMember(id: "p1", name: "Mina Okafor",
                                                                    avatar: "https://cdn/m.png"))
    }
}
