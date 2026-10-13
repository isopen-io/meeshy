import Foundation
import Testing
@testable import MeeshySDK

/// #10483 — demande du porteur du 2026-10-13 : le TAP envoie un engagement
/// d'ouverture et son origine ; la vue de l'écran détail dit par où il est
/// arrivé. Le fil, et la requête à part des `open`.
@Suite("ContentReach — l'engagement d'ouverture et la provenance de la vue")
struct ContentReachEncodingTests {

    private func json(_ event: SocialEvent) throws -> [String: Any] {
        let data = try JSONEncoder().encode(event)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func open_carriesTypePostIdAndOrigin() throws {
        let body = try json(.open(postId: "p1", origin: .feed))
        #expect(body["type"] as? String == "open")
        #expect(body["postId"] as? String == "p1")
        #expect(body["origin"] as? String == "feed")
        #expect(Set(body.keys) == ["type", "postId", "origin"])
    }

    @Test func open_withoutOrigin_omitsTheKey() throws {
        let body = try json(.open(postId: "p1", origin: nil))
        #expect(Set(body.keys) == ["type", "postId"])
    }

    @Test func open_storyRailOrigin_isWrittenInSnakeCase() throws {
        let body = try json(.open(postId: "s1", origin: .storyRail))
        #expect(body["origin"] as? String == "story_rail")
    }

    @Test func view_fromAListing_carriesProvenanceAndOrigin() throws {
        let body = try json(.view(postId: "p1", durationMs: nil, surface: .detail, entry: .listing(.profile)))
        #expect(body["provenance"] as? String == "listing")
        #expect(body["origin"] as? String == "profile")
        #expect(body["surface"] as? String == "detail")
    }

    @Test func view_fromATrackingLink_carriesNoOrigin() throws {
        let body = try json(.view(postId: "p1", durationMs: 900, surface: .visitor, entry: .trackingLink))
        #expect(body["provenance"] as? String == "tracking_link")
        #expect(body["origin"] == nil)
        #expect(body["durationMs"] as? Int == 900)
    }

    @Test func view_withoutEntry_keepsTheFormerWire() throws {
        let body = try json(.view(postId: "p1", durationMs: nil, surface: nil))
        #expect(Set(body.keys) == ["type", "postId"])
    }

    @Test func provenances_areWrittenAsTheSharedContract() throws {
        #expect(try json(.view(postId: "p", durationMs: nil, surface: nil, entry: .notification))["provenance"] as? String == "notification")
        #expect(try json(.view(postId: "p", durationMs: nil, surface: nil, entry: .sharedLink))["provenance"] as? String == "shared_link")
        #expect(try json(.view(postId: "p", durationMs: nil, surface: nil, entry: .external))["provenance"] as? String == "external")
        #expect(try json(.view(postId: "p", durationMs: nil, surface: nil, entry: .direct))["provenance"] as? String == "direct")
    }

    /// Les énumérations sont FERMÉES et mirent `content-reach.ts` valeur pour valeur.
    @Test func enumerations_mirrorTheSharedContract() {
        #expect(OpenOrigin.allCases.map(\.rawValue) == [
            "feed", "reels", "profile", "bookmarks", "hashtag", "community",
            "nearby", "sound", "story_rail", "mood_avatar", "citation", "search",
        ])
        #expect(ViewProvenance.allCases.map(\.rawValue) == [
            "listing", "notification", "shared_link", "tracking_link", "external", "direct",
        ])
    }

    @Test func onlyAListingEntryCarriesAnOrigin() {
        #expect(ContentEntry.listing(.feed).origin == .feed)
        #expect(ContentEntry.notification.origin == nil)
        #expect(ContentEntry.direct.origin == nil)
    }

    @Test func detailImpressionSource_keepsTheFormerSources() {
        #expect(ContentEntry.listing(.feed).detailImpressionSource == "detail")
        #expect(ContentEntry.notification.detailImpressionSource == "notification")
        #expect(ContentEntry.sharedLink.detailImpressionSource == "shared_link")
        #expect(ContentEntry.trackingLink.detailImpressionSource == "shared_link")
        #expect(ContentEntry.external.detailImpressionSource == "detail")
        #expect(ContentEntry.direct.detailImpressionSource == "detail")
    }

    @Test func events_roundTripThroughCodable() throws {
        let events: [SocialEvent] = [
            .open(postId: "p1", origin: .bookmarks),
            .open(postId: "p2", origin: nil),
            .view(postId: "p1", durationMs: 12, surface: .detail, entry: .listing(.bookmarks)),
            .view(postId: "p3", durationMs: nil, surface: .reels, entry: .notification),
            .impression(postId: "p1", source: "detail", surface: .detail),
        ]
        let data = try JSONEncoder().encode(events)
        #expect(try JSONDecoder().decode([SocialEvent].self, from: data) == events)
    }

    /// Une file écrite par une version plus récente ne fait pas tomber le décodage.
    @Test func unknownOriginAndProvenance_decodeAsAbsent() throws {
        let data = Data(#"[{"type":"open","postId":"p1","origin":"teleport"},{"type":"view","postId":"p2","provenance":"carrier_pigeon"}]"#.utf8)
        let events = try JSONDecoder().decode([SocialEvent].self, from: data)
        #expect(events == [
            .open(postId: "p1", origin: nil),
            .view(postId: "p2", durationMs: nil, surface: nil, entry: nil),
        ])
    }
}

@Suite("SocialEventsDispatch — les `open` partent seuls, et leur refus n'emporte rien d'autre")
struct SocialEventsDispatchTests {

    private func receiptStub() throws -> APIResponse<SocialEventsReceipt> {
        let data = Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8)
        return try JSONDecoder().decode(APIResponse<SocialEventsReceipt>.self, from: data)
    }

    private static func types(of request: MockAPIClient.RecordedRequest) -> [String] {
        let events = request.bodyJSON?["events"] as? [[String: Any]] ?? []
        return events.compactMap { $0["type"] as? String }
    }

    private static func carriesOpen(_ request: MockAPIClient.RecordedRequest) -> Bool {
        types(of: request).contains("open")
    }

    private let mixed: [SocialEvent] = [
        .view(postId: "p1", durationMs: nil, surface: .detail, entry: .listing(.feed)),
        .open(postId: "p2", origin: .feed),
        .impression(postId: "p1", source: "detail", surface: .detail),
        .open(postId: "p3", origin: .profile),
    ]

    @Test func requests_putTheOpensInARequestOfTheirOwn() {
        let requests = SocialEventsDispatch.requests(for: mixed)

        #expect(requests.count == 2)
        #expect(requests[0].allSatisfy { !$0.isOpen })
        #expect(requests[0].map(\.postId) == ["p1", "p1"])
        #expect(requests[1] == [.open(postId: "p2", origin: .feed), .open(postId: "p3", origin: .profile)])
    }

    @Test func requests_withoutOpens_isASingleRequest() {
        let requests = SocialEventsDispatch.requests(for: [.impression(postId: "p1", source: "feed", surface: .feed)])
        #expect(requests.count == 1)
    }

    @Test func deliver_sendsTwoRequests_neitherMixesOpensWithReach() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())

        let unsent = await SocialEventsDispatch.deliver(mixed, credential: .account, through: PostService(api: api))

        #expect(unsent.isEmpty)
        #expect(api.requestCount == 2)
        #expect(Self.types(of: api.requests[0]) == ["view", "impression"])
        #expect(Self.types(of: api.requests[1]) == ["open", "open"])
    }

    /// Un ancien serveur refuse `open` (400) : les `open` sont retirés sans
    /// rejeu, la vue et l'impression sont comptées.
    @Test func deliver_openRefusedWith400_dropsTheOpens_andKeepsNothingToReplay() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        api.errorForRequest = { request in
            guard Self.carriesOpen(request) else { return nil }
            return MeeshyError.server(statusCode: 400, message: "invalid")
        }

        let unsent = await SocialEventsDispatch.deliver(mixed, credential: .account, through: PostService(api: api))

        #expect(unsent.isEmpty, "Un refus définitif ne se rejoue pas.")
        #expect(api.requestCount == 2)
        #expect(Self.types(of: api.requests[0]) == ["view", "impression"], "La vue et l'impression partent quand même.")
    }

    @Test func deliver_openForbidden_neverTakesTheReachDown() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        api.errorForRequest = { request in
            guard Self.carriesOpen(request) else { return MeeshyError.server(statusCode: 503, message: "down") }
            return MeeshyError.forbidden(reason: nil, body: nil)
        }

        let unsent = await SocialEventsDispatch.deliver(mixed, credential: .visitor("visitor_k"), through: PostService(api: api))

        #expect(unsent == [
            .view(postId: "p1", durationMs: nil, surface: .detail, entry: .listing(.feed)),
            .impression(postId: "p1", source: "detail", surface: .detail),
        ], "La panne de la requête des vues la garde pour un rejeu ; le 403 des `open` ne s'y ajoute pas.")
    }

    @Test func deliver_openLostToTheNetwork_isKeptForReplay() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        api.errorForRequest = { request in
            guard Self.carriesOpen(request) else { return nil }
            return MeeshyError.network(.noConnection)
        }

        let unsent = await SocialEventsDispatch.deliver(mixed, credential: .account, through: PostService(api: api))

        #expect(unsent == [.open(postId: "p2", origin: .feed), .open(postId: "p3", origin: .profile)])
    }

    @Test func permanentRefusals_areTheUnreplayableOnes() {
        #expect(SocialEventsDispatch.isPermanentRefusal(MeeshyError.server(statusCode: 400, message: "")))
        #expect(SocialEventsDispatch.isPermanentRefusal(MeeshyError.forbidden(reason: nil, body: nil)))
        #expect(!SocialEventsDispatch.isPermanentRefusal(MeeshyError.server(statusCode: 429, message: "")))
        #expect(!SocialEventsDispatch.isPermanentRefusal(MeeshyError.server(statusCode: 500, message: "")))
        #expect(!SocialEventsDispatch.isPermanentRefusal(MeeshyError.network(.noConnection)))
    }
}

@Suite("MarkStoryViewedPayload — la vue d'une story garde son entrée dans la file durable")
struct MarkStoryViewedPayloadEntryTests {

    @Test func entry_roundTripsThroughTheOutboxPayload() throws {
        let payload = MarkStoryViewedPayload(clientMutationId: "c1", storyId: "s1", entry: .listing(.storyRail))

        let decoded = try JSONDecoder().decode(MarkStoryViewedPayload.self, from: JSONEncoder().encode(payload))

        #expect(decoded.entry == .listing(.storyRail))
        #expect(decoded.provenance == "listing")
        #expect(decoded.origin == "story_rail")
    }

    /// Une ligne écrite avant #10483 n'a pas les clés : elle se décode, sans entrée.
    @Test func formerRow_decodesWithoutEntry() throws {
        let data = Data(#"{"clientMutationId":"c1","storyId":"s1"}"#.utf8)

        let decoded = try JSONDecoder().decode(MarkStoryViewedPayload.self, from: data)

        #expect(decoded.storyId == "s1")
        #expect(decoded.entry == nil)
    }

    @Test func unknownProvenance_readsAsNoEntry() throws {
        let data = Data(#"{"clientMutationId":"c1","storyId":"s1","provenance":"carrier_pigeon"}"#.utf8)

        #expect(try JSONDecoder().decode(MarkStoryViewedPayload.self, from: data).entry == nil)
    }
}
