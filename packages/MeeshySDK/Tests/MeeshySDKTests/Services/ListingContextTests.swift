import Foundation
import CoreGraphics
import Testing
@testable import MeeshySDK

/// #10501 — chaque impression dit sa position, sa page de fil et sa source de
/// classement. La passerelle sert `meta.feedRequestId` et `rankingSource` par
/// élément ; un serveur ou une route qui ne les sert pas ne casse rien.
@Suite("Contexte de listing — la page servie situe l'impression")
struct ListingContextTests {

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private func post(_ id: String, rankingSource: String? = nil) -> String {
        let ranking = rankingSource.map { #", "rankingSource": "\#($0)""# } ?? ""
        return #"{ "id": "\#(id)", "createdAt": "2026-06-20T10:00:00Z", "author": { "id": "u1", "name": "Marie", "username": "marie" }\#(ranking) }"#
    }

    private func page(_ posts: [String], meta: String? = nil) throws -> PaginatedAPIResponse<[APIPost]> {
        let tail = meta.map { #", "meta": \#($0)"# } ?? ""
        let items = posts.joined(separator: ",")
        let json = #"{ "success": true, "data": [\#(items)], "pagination": null\#(tail) }"#
        return try decoder().decode(PaginatedAPIResponse<[APIPost]>.self, from: Data(json.utf8))
    }

    private func json(_ value: some Encodable) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Décodage

    @Test func servedPage_decodesItsFeedRequestIdAndEachRankingSource() throws {
        let served = try page([post("p1", rankingSource: "for_you"), post("p2", rankingSource: "following")], meta: #"{ "feedRequestId": "fr_abc" }"#)

        #expect(served.meta?.feedRequestId == "fr_abc")
        #expect(served.data.map(\.rankingSource) == ["for_you", "following"])
    }

    @Test func pageWithoutMeta_decodes_andSituatesNothing() throws {
        let served = try page([post("p1")])
        var index = ListingPageIndex()
        index.note(surface: .feed, feedRequestId: served.meta?.feedRequestId, items: served.data.map { ListedItem(id: $0.id, rankingSource: $0.rankingSource) })

        #expect(served.meta == nil)
        #expect(served.data.first?.rankingSource == nil)
        #expect(index.count == 0)
        #expect(index.listing(on: .feed, postId: "p1", position: nil) == nil)
        #expect(index.listing(on: .feed, postId: "p1", position: 4) == SocialListing(position: 4))
    }

    @Test func metaOfAnotherShape_doesNotBreakThePage() throws {
        let served = try page([post("p1", rankingSource: "for_you")], meta: #"{ "deletedStoryIds": ["s1"] }"#)

        #expect(served.meta?.feedRequestId == nil)
        #expect(served.meta?.deletedStoryIds == ["s1"])
        #expect(served.data.count == 1)
    }

    @Test func rankingSourceOfAnUnexpectedType_isReadAsAbsent() throws {
        let json = #"{ "id": "p1", "createdAt": "2026-06-20T10:00:00Z", "author": { "id": "u1", "name": "Marie", "username": "marie" }, "rankingSource": 7 }"#
        let decoded = try decoder().decode(APIPost.self, from: Data(json.utf8))

        #expect(decoded.id == "p1")
        #expect(decoded.rankingSource == nil)
    }

    // MARK: - Le registre

    @Test func samePostServedToTheFeedThenToAHashtag_hasOneContextPerListing() {
        var index = ListingPageIndex()
        index.note(surface: .feed, feedRequestId: "fr_feed", items: [ListedItem(id: "p0", rankingSource: "for_you"), ListedItem(id: "p1", rankingSource: "for_you")])
        index.note(surface: .hashtag, feedRequestId: "fr_tag", items: [ListedItem(id: "p1", rankingSource: "hashtag")])

        #expect(index.listing(on: .feed, postId: "p1", position: 1) == SocialListing(feedRequestId: "fr_feed", position: 1, rankingSource: .forYou))
        #expect(index.listing(on: .hashtag, postId: "p1", position: 0) == SocialListing(feedRequestId: "fr_tag", position: 0, rankingSource: .hashtag))
        #expect(index.listing(on: .bookmarks, postId: "p1", position: 2) == SocialListing(position: 2))
    }

    @Test func aPostServedAgain_takesThePageThatServedItLast() {
        var index = ListingPageIndex()
        index.note(surface: .feed, feedRequestId: "fr_1", items: [ListedItem(id: "p1", rankingSource: "following")])
        index.note(surface: .feed, feedRequestId: "fr_2", items: [ListedItem(id: "p1", rankingSource: "for_you")])

        #expect(index.count == 1)
        #expect(index.listing(on: .feed, postId: "p1", position: 0)?.feedRequestId == "fr_2")
        #expect(index.listing(on: .feed, postId: "p1", position: 0)?.rankingSource == .forYou)
    }

    @Test func anUnknownServedSource_fallsBackToOther_andANegativeRankIsNoRank() {
        var index = ListingPageIndex()
        index.note(surface: .feed, feedRequestId: "fr_1", items: [ListedItem(id: "p1", rankingSource: "editorial")])

        #expect(index.listing(on: .feed, postId: "p1", position: -1) == SocialListing(feedRequestId: "fr_1", rankingSource: .other))
        #expect(index.listing(on: nil, postId: "p1", position: nil) == nil)
    }

    @Test func anOversizedPageIdentifier_isNotKept() {
        var index = ListingPageIndex()
        index.note(surface: .feed, feedRequestId: String(repeating: "x", count: ListingPageIndex.maxFeedRequestIdLength + 1), items: [ListedItem(id: "p1")])

        #expect(index.count == 0)
    }

    @Test func beyondCapacity_theOldestServedItemsAreForgotten() {
        var index = ListingPageIndex()
        index.note(surface: .feed, feedRequestId: "fr_1", items: (0...ListingPageIndex.capacity).map { ListedItem(id: "p\($0)") })

        #expect(index.count == ListingPageIndex.capacity)
        #expect(index.listing(on: .feed, postId: "p0", position: nil) == nil)
        #expect(index.listing(on: .feed, postId: "p\(ListingPageIndex.capacity)", position: nil)?.feedRequestId == "fr_1")
    }

    @Test func ledger_notesAndReads_thenForgetsOnReset() {
        let ledger = ListingContextLedger()
        ledger.note(surface: .nearby, feedRequestId: "fr_near", items: [ListedItem(id: "p1", rankingSource: "nearby")])

        #expect(ledger.listing(on: .nearby, postId: "p1", position: 2) == SocialListing(feedRequestId: "fr_near", position: 2, rankingSource: .nearby))
        ledger.reset()
        #expect(ledger.listing(on: .nearby, postId: "p1", position: nil) == nil)
    }

    @Test func postService_notesThePageItServes_onItsSurface() async throws {
        let mock = MockAPIClient()
        let ledger = ListingContextLedger()
        let service = PostService(api: mock, listings: ledger)
        mock.stub("/posts/hashtag/paris", result: try page([post("p1", rankingSource: "hashtag")], meta: #"{ "feedRequestId": "fr_tag" }"#))

        let served = try await service.getPostsByHashtag(tag: "paris", cursor: nil, limit: 20)

        #expect(served.data.map(\.id) == ["p1"])
        #expect(ledger.listing(on: .hashtag, postId: "p1", position: 0) == SocialListing(feedRequestId: "fr_tag", position: 0, rankingSource: .hashtag))
        #expect(ledger.listing(on: .feed, postId: "p1", position: nil) == nil)
    }

    // MARK: - Le fil : l'impression

    @Test func impression_carriesItsListingAndItsVisibility() throws {
        let body = try json(SocialEvent.impression(
            postId: "p1", source: "feed", surface: .feed,
            listing: SocialListing(feedRequestId: "fr_abc", position: 3, rankingSource: .forYou),
            visibility: SocialVisibility(maxVisibleFraction: 0.6, visibleMs: 1_200, viewable: true)
        ))

        let listing = try #require(body["listing"] as? [String: Any])
        let visibility = try #require(body["visibility"] as? [String: Any])
        #expect(listing["feedRequestId"] as? String == "fr_abc")
        #expect(listing["position"] as? Int == 3)
        #expect(listing["rankingSource"] as? String == "for_you")
        #expect(listing["listingSessionId"] == nil)
        #expect(visibility["maxVisibleFraction"] as? Double == 0.6)
        #expect(visibility["visibleMs"] as? Int == 1_200)
        #expect(visibility["viewable"] as? Bool == true)
        #expect(visibility["impressionEventId"] == nil)
    }

    @Test func impressionOutsideAListing_writesNeitherKey() throws {
        let body = try json(SocialEvent.impression(postId: "p1", source: "detail", surface: .detail))

        #expect(body["listing"] == nil)
        #expect(body["visibility"] == nil)
    }

    @Test func impression_survivesAPersistedQueue_withItsListingAndVisibility() throws {
        let event = SocialEvent.impression(
            postId: "p1", source: "search", surface: .hashtag,
            listing: SocialListing(feedRequestId: "fr_tag", position: 0, rankingSource: .hashtag),
            visibility: SocialVisibility(maxVisibleFraction: 0.4, visibleMs: 900, viewable: false)
        )

        let decoded = try JSONDecoder().decode(SocialEvent.self, from: JSONEncoder().encode(event))

        #expect(decoded == event)
    }

    @Test func impressionQueuedBeforeListings_isReadWithoutContext() throws {
        let legacy = #"{ "type": "impression", "postId": "p1", "source": "feed", "surface": "feed" }"#

        let decoded = try JSONDecoder().decode(SocialEvent.self, from: Data(legacy.utf8))

        #expect(decoded == .impression(postId: "p1", source: "feed", surface: .feed))
    }

    @Test func aQueuedRankingSourceFromANewerVersion_isReadAsOther() throws {
        let newer = #"{ "type": "impression", "postId": "p1", "source": "feed", "listing": { "position": 2, "rankingSource": "editorial" } }"#

        let decoded = try JSONDecoder().decode(SocialEvent.self, from: Data(newer.utf8))

        #expect(decoded == .impression(postId: "p1", source: "feed", surface: nil, listing: SocialListing(position: 2, rankingSource: .other)))
    }

    // MARK: - La part relayée par une cellule

    @Test func steppedFraction_movesByFivePercentSteps_andKeepsTheMRCThreshold() {
        let viewport = CGRect(x: 0, y: 0, width: 100, height: 1_000)
        func cell(visible: CGFloat) -> CGRect { CGRect(x: 0, y: 1_000 - visible, width: 100, height: 200) }

        #expect(ViewabilityMeter.steppedFraction(of: cell(visible: 100), in: viewport) == 0.5)
        #expect(ViewabilityMeter.steppedFraction(of: cell(visible: 99), in: viewport) == 0.45)
        #expect(ViewabilityMeter.steppedFraction(of: cell(visible: 123), in: viewport) == 0.6)
        #expect(ViewabilityMeter.steppedFraction(of: cell(visible: 200), in: viewport) == 1)
        #expect(ViewabilityMeter.steppedFraction(of: cell(visible: 0), in: viewport) == 0)
        #expect(ViewabilityMeter.steppedFraction(of: cell(visible: 121), in: viewport) == ViewabilityMeter.steppedFraction(of: cell(visible: 128), in: viewport))
    }
}
