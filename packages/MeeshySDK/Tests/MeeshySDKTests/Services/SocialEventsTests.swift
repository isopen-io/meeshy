import Foundation
import Testing
@testable import MeeshySDK

/// #10483 — chaque affichage d'un contenu est compté, avec ou sans compte.
/// Le fil de `POST /social/events` côté iOS : ce qui part, sous quel en-tête.
@Suite("SocialEvents — le contrat de fil de la porte de lecture")
struct SocialEventsEncodingTests {

    private func json(_ event: SocialEvent) throws -> [String: Any] {
        let data = try JSONEncoder().encode(event)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func view_withDurationAndSurface_carriesBoth() throws {
        let body = try json(.view(postId: "p1", durationMs: 4200, surface: .visitor))
        #expect(body["type"] as? String == "view")
        #expect(body["postId"] as? String == "p1")
        #expect(body["durationMs"] as? Int == 4200)
        #expect(body["surface"] as? String == "visitor")
        #expect(body["source"] == nil)
    }

    @Test func view_withoutDurationNorSurface_omitsTheKeys() throws {
        let body = try json(.view(postId: "p1", durationMs: nil, surface: nil))
        #expect(Set(body.keys) == ["type", "postId"])
    }

    @Test func impression_withSurface_carriesSourceAndSurface() throws {
        let body = try json(.impression(postId: "p2", source: "detail", surface: .visitor))
        #expect(body["type"] as? String == "impression")
        #expect(body["postId"] as? String == "p2")
        #expect(body["source"] as? String == "detail")
        #expect(body["surface"] as? String == "visitor")
    }

    @Test func impression_withoutSurface_omitsTheSurfaceKey() throws {
        let body = try json(.impression(postId: "p2", source: "feed", surface: nil))
        #expect(Set(body.keys) == ["type", "postId", "source"])
    }

    @Test func storyRailSurface_isWrittenInSnakeCase() throws {
        let body = try json(.impression(postId: "p3", source: "story", surface: .storyRail))
        #expect(body["surface"] as? String == "story_rail")
    }

    @Test func events_roundTripThroughCodable() throws {
        let events: [SocialEvent] = [
            .view(postId: "p1", durationMs: 12, surface: .detail),
            .impression(postId: "p2", source: "search", surface: .nearby),
            .impression(postId: "p3", source: "feed", surface: nil),
        ]
        let data = try JSONEncoder().encode(events)
        #expect(try JSONDecoder().decode([SocialEvent].self, from: data) == events)
    }
}

@Suite("PostService.recordSocialEvents — sous quelle identité le lot part")
struct PostServiceSocialEventsTests {

    private func receiptStub() throws -> APIResponse<SocialEventsReceipt> {
        let data = Data(#"{"success":true,"data":{"recorded":2,"rejected":0}}"#.utf8)
        return try JSONDecoder().decode(APIResponse<SocialEventsReceipt>.self, from: data)
    }

    @Test func visitor_sendsTheKeyAsSessionToken_onTheSocialEventsDoor() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        let service = PostService(api: api)

        let receipt = try await service.recordSocialEvents(
            [.impression(postId: "p1", source: "detail", surface: .visitor), .view(postId: "p1", durationMs: nil, surface: .visitor)],
            credential: .visitor("visitor_abc")
        )

        #expect(receipt == SocialEventsReceipt(recorded: 2, rejected: 0))
        let request = try #require(api.lastRequest)
        #expect(request.endpoint == "/social/events")
        #expect(request.method == "POST")
        #expect(request.headers == ["X-Session-Token": "visitor_abc"])
        let events = try #require(request.bodyJSON?["events"] as? [[String: Any]])
        #expect(events.count == 2)
        #expect(events.first?["surface"] as? String == "visitor")
    }

    @Test func account_addsNoSessionHeader() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        let service = PostService(api: api)

        _ = try await service.recordSocialEvents(
            [.impression(postId: "p1", source: "search", surface: .nearby)],
            credential: .account
        )

        #expect(api.lastRequest?.headers == nil)
    }

    @Test func emptyBatch_sendsNothing() async throws {
        let api = MockAPIClient()
        let service = PostService(api: api)

        let receipt = try await service.recordSocialEvents([], credential: .account)

        #expect(receipt == SocialEventsReceipt(recorded: 0, rejected: 0))
        #expect(api.requestCount == 0)
    }
}

/// La session de consommation de l'`EngagementTracker` part par la porte
/// unique, en `dwell` : le corps de l'ancien `POST /posts/engagement/batch`
/// augmenté du discriminant, et `startedAt` en chaîne ISO 8601 — un nombre
/// ferait refuser le lot entier par le schéma de la passerelle.
@Suite("SocialEvent.dwell — la session de consommation passe par la porte unique")
struct SocialEventsDwellTests {

    private func session() -> EngagementSession {
        EngagementSession(
            sessionId: "11111111-2222-3333-4444-555555555555", userId: "u1", postId: "p1",
            contentType: .reel, surface: .reels,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000), dwellMs: 4000, watchMs: 3800,
            mediaDurationMs: 15000, completed: false, truncated: false, consent: "granted",
            actions: [EngagementAction(type: .paused, atMs: 1200)],
            watchSamples: [WatchSample(positionMs: 1000, atMs: 1000)]
        )
    }

    private func receiptStub() throws -> APIResponse<SocialEventsReceipt> {
        let data = Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8)
        return try JSONDecoder().decode(APIResponse<SocialEventsReceipt>.self, from: data)
    }

    @Test func dwell_postsTheSessionToTheSocialEventsDoor_withAnISODate() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        let service = PostService(api: api)

        _ = try await service.recordSocialEvents([.dwell(session())], credential: .account)

        let request = try #require(api.lastRequest)
        #expect(request.endpoint == "/social/events")
        #expect(request.method == "POST")
        let events = try #require(request.bodyJSON?["events"] as? [[String: Any]])
        let event = try #require(events.first)
        #expect(event["type"] as? String == "dwell")
        #expect(event["postId"] as? String == "p1")
        #expect(event["sessionId"] as? String == "11111111-2222-3333-4444-555555555555")
        #expect(event["contentType"] as? String == "REEL")
        #expect(event["surface"] as? String == "reels")
        #expect(event["dwellMs"] as? Int == 4000)
        #expect(event["watchMs"] as? Int == 3800)
        #expect(event["consent"] as? String == "granted")
        #expect(event["startedAt"] as? String == "2023-11-14T22:13:20Z")
        #expect((event["actions"] as? [[String: Any]])?.first?["type"] as? String == "paused")
        #expect((event["watchSamples"] as? [[String: Any]])?.count == 1)
    }

    @Test func dwell_roundTripsThroughCodable() throws {
        let events: [SocialEvent] = [.dwell(session()), .view(postId: "p2", durationMs: nil, surface: .detail)]
        let data = try JSONEncoder().encode(events)
        #expect(try JSONDecoder().decode([SocialEvent].self, from: data) == events)
    }

    @Test func dwell_isNotAnOpen_soItTravelsWithViewsAndImpressions() {
        let requests = SocialEventsDispatch.requests(for: [
            .dwell(session()), .open(postId: "p3", origin: .feed),
        ])
        #expect(requests.count == 2)
        #expect(requests.first == [.dwell(session())])
        #expect(SocialEvent.dwell(session()).postId == "p1")
    }

    /// #10764 — le premier contact part sous le type `dwell-start`, avec le
    /// corps et la clé de session de la mesure qui suivra ; son identifiant de
    /// rejeu est stable mais distinct de celui de la mesure.
    @Test func dwellStart_carriesTheSessionUnderItsOwnType_andItsOwnStableEventId() throws {
        let stamped = StampedSocialEvent.stamping(.dwellStart(session()), at: Date())
        let body = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(stamped)) as? [String: Any])

        #expect(body["type"] as? String == "dwell-start")
        #expect(body["sessionId"] as? String == "11111111-2222-3333-4444-555555555555")
        #expect(body["surface"] as? String == "reels")
        #expect(stamped.stamp == StampedSocialEvent.stamping(.dwellStart(session()), at: Date()).stamp)
        #expect(stamped.stamp.eventId != StampedSocialEvent.stamping(.dwell(session()), at: Date()).stamp.eventId)
        #expect(try JSONDecoder().decode(SocialEvent.self, from: JSONEncoder().encode(SocialEvent.dwellStart(session()))) == .dwellStart(session()))
    }
}

@Suite("ReachImpressionCollector — les affichages d'une surface du SDK")
@MainActor
struct ReachImpressionCollectorTests {

    private func receiptStub() throws -> APIResponse<SocialEventsReceipt> {
        let data = Data(#"{"success":true,"data":{"recorded":2,"rejected":0}}"#.utf8)
        return try JSONDecoder().decode(APIResponse<SocialEventsReceipt>.self, from: data)
    }

    @Test func flush_sendsOneBatch_withSourceAndSurface() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        let sut = ReachImpressionCollector(source: "search", surface: .sound, postService: PostService(api: api))

        sut.record("p1")
        sut.record("p2")
        await sut.flushNow()

        #expect(api.requestCount == 1)
        let events = try #require(api.lastRequest?.bodyJSON?["events"] as? [[String: Any]])
        #expect(events.map { $0["postId"] as? String } == ["p1", "p2"])
        #expect(events.allSatisfy { $0["source"] as? String == "search" && $0["surface"] as? String == "sound" })
    }

    @Test func flush_withNothingDisplayed_sendsNothing() async {
        let api = MockAPIClient()
        let sut = ReachImpressionCollector(source: "search", surface: .sound, postService: PostService(api: api))

        await sut.flushNow()

        #expect(api.requestCount == 0)
    }
}

@Suite("VisitorReaderKey — la clé d'un lecteur sans compte")
struct VisitorReaderKeyTests {

    @Test func key_isStableBetweenTwoReads_andStartsWithVisitorPrefix() {
        let sut = VisitorReaderKey(keychain: InMemoryVisitorKeychain())

        let first = sut.readerKey()
        let second = sut.readerKey()

        #expect(first == second)
        #expect(first.hasPrefix("visitor_"))
        #expect(first.count > "visitor_".count)
    }

    @Test func key_survivesANewInstanceOnTheSameKeychain() {
        let keychain = InMemoryVisitorKeychain()
        let first = VisitorReaderKey(keychain: keychain).readerKey()

        #expect(VisitorReaderKey(keychain: keychain).readerKey() == first)
    }

    @Test func purge_drawsAFreshKeyOnTheNextRead() {
        let sut = VisitorReaderKey(keychain: InMemoryVisitorKeychain())
        let first = sut.readerKey()

        sut.purge()

        #expect(sut.readerKey() != first)
    }

    @Test func storedKey_neverDrawsAKey() {
        let sut = VisitorReaderKey(keychain: InMemoryVisitorKeychain())

        #expect(sut.storedReaderKey() == nil)
        #expect(sut.storedReaderKey() == nil)
        let drawn = sut.readerKey()
        #expect(sut.storedReaderKey() == drawn)
    }

    @Test func storedKey_isGoneAfterPurge() {
        let sut = VisitorReaderKey(keychain: InMemoryVisitorKeychain())
        _ = sut.readerKey()

        sut.purge()

        #expect(sut.storedReaderKey() == nil)
    }
}

@Suite("APIPost — la part anonyme des compteurs")
struct APIPostAnonymousCountersTests {

    private func decode(_ json: String) throws -> APIPost {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIPost.self, from: Data(json.utf8))
    }

    @Test func anonymousCounters_areDecoded_andReachTheFeedPost() throws {
        let post = try decode("""
        {"id":"p1","type":"POST","content":"x","createdAt":"2026-10-13T10:00:00Z",
         "author":{"id":"a1","username":"ada"},"viewCount":9,"anonymousViewCount":3,"anonymousImpressionCount":7}
        """)

        #expect(post.anonymousViewCount == 3)
        #expect(post.anonymousImpressionCount == 7)
        #expect(post.toFeedPost().anonymousViewCount == 3)
    }

    @Test func anonymousCounters_absentFromAnOldServer_stayNil() throws {
        let post = try decode("""
        {"id":"p1","type":"POST","content":"x","createdAt":"2026-10-13T10:00:00Z",
         "author":{"id":"a1","username":"ada"},"viewCount":9}
        """)

        #expect(post.anonymousViewCount == nil)
        #expect(post.toFeedPost().anonymousViewCount == nil)
        #expect(post.uniqueViewCount == nil)
        #expect(post.anonymousUniqueViewCount == nil)
    }

    /// `viewCount` compte TOUTES les vues ; les vues UNIQUES (une par compte,
    /// une par lecteur anonyme) sont servies à côté, décodées sans être
    /// affichées pour l'instant.
    @Test func uniqueViewCounts_areDecoded_andReachTheFeedPost() throws {
        let post = try decode("""
        {"id":"p1","type":"POST","content":"x","createdAt":"2026-10-13T10:00:00Z",
         "author":{"id":"a1","username":"ada"},"viewCount":12,"uniqueViewCount":5,"anonymousUniqueViewCount":2}
        """)

        #expect(post.viewCount == 12)
        #expect(post.uniqueViewCount == 5)
        #expect(post.anonymousUniqueViewCount == 2)
        #expect(post.toFeedPost().uniqueViewCount == 5)
        #expect(post.toFeedPost().anonymousUniqueViewCount == 2)
        #expect(post.toFeedPost().viewCount == 12)
    }
}

private final class InMemoryVisitorKeychain: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]
    private let lock = NSLock()

    func save(_ value: String, forKey key: String, account: String?) throws {
        lock.lock(); defer { lock.unlock() }
        store[key] = value
    }

    func load(forKey key: String, account: String?) -> String? {
        lock.lock(); defer { lock.unlock() }
        return store[key]
    }

    func delete(forKey key: String, account: String?) {
        lock.lock(); defer { lock.unlock() }
        store[key] = nil
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
