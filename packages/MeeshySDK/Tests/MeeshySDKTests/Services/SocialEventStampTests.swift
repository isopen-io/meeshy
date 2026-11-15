import Foundation
import Testing
@testable import MeeshySDK

/// #10500 — un événement de comptage rejoué ou vidé d'une file hors ligne
/// n'est compté qu'une fois, et daté de son occurrence. L'enveloppe
/// (`eventId`, `occurredAt`) se pose À LA CRÉATION et voyage avec l'événement.
@Suite("SocialEventStamp — l'enveloppe d'un événement de comptage")
struct SocialEventStampTests {

    private let occurredAt = Date(timeIntervalSince1970: 1_700_000_000)

    private func json(_ value: some Encodable) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func session(id: String = "11111111-2222-3333-4444-555555555555") -> EngagementSession {
        EngagementSession(
            sessionId: id, userId: "u1", postId: "p1",
            contentType: .reel, surface: .reels,
            startedAt: occurredAt, dwellMs: 4_000, watchMs: nil,
            mediaDurationMs: nil, completed: false, truncated: false, consent: "granted",
            actions: [], watchSamples: []
        )
    }

    @Test func stampedImpression_carriesEventIdAndOccurredAt_flatInTheEvent() throws {
        let stamped = StampedSocialEvent.stamping(
            .impression(postId: "p1", source: "feed", surface: .feed),
            at: occurredAt,
            newId: { "0f8fad5b-d9cb-469f-a165-70867728950e" }
        )

        let body = try json(stamped)

        #expect(body["type"] as? String == "impression")
        #expect(body["postId"] as? String == "p1")
        #expect(body["eventId"] as? String == "0f8fad5b-d9cb-469f-a165-70867728950e")
        #expect(body["occurredAt"] as? String == "2023-11-14T22:13:20.000Z")
    }

    @Test func eachCreation_mintsItsOwnEventId() {
        let one = StampedSocialEvent.stamping(.view(postId: "p1", durationMs: nil, surface: .detail), at: occurredAt)
        let other = StampedSocialEvent.stamping(.view(postId: "p1", durationMs: nil, surface: .detail), at: occurredAt)

        #expect(one.stamp.eventId != other.stamp.eventId)
        #expect(UUID(uuidString: one.stamp.eventId) != nil)
        #expect(one.stamp.eventId == one.stamp.eventId.lowercased())
    }

    @Test func roundTrip_keepsTheEnvelope() throws {
        let stamped = StampedSocialEvent.stamping(.open(postId: "p1", origin: .feed), at: occurredAt)

        let decoded = try JSONDecoder().decode(StampedSocialEvent.self, from: JSONEncoder().encode(stamped))

        #expect(decoded == stamped)
    }

    /// Une file écrite avant #10500 : l'événement se relit sans perte, reçoit
    /// un identifiant, et son heure reste inconnue (la passerelle date à
    /// réception).
    @Test func decodingAnEventWithoutEnvelope_isTolerant() throws {
        let legacy = Data(#"{"type":"view","postId":"p1","durationMs":1500,"surface":"visitor"}"#.utf8)

        let decoded = try JSONDecoder().decode(StampedSocialEvent.self, from: legacy)

        #expect(decoded.event == .view(postId: "p1", durationMs: 1_500, surface: .visitor))
        #expect(UUID(uuidString: decoded.stamp.eventId) != nil)
        #expect(decoded.stamp.occurredAt == nil)
    }

    @Test func anUnreadableOccurredAt_readsAsAbsent() throws {
        let data = Data(#"{"type":"impression","postId":"p1","source":"feed","eventId":"e1","occurredAt":"hier"}"#.utf8)

        let decoded = try JSONDecoder().decode(StampedSocialEvent.self, from: data)

        #expect(decoded.stamp == SocialEventStamp(eventId: "e1", occurredAt: nil))
    }

    /// Une session de consommation porte un identifiant PERSISTÉ par
    /// `EngagementOutbox` : chaque tentative le réutilise, et la session est
    /// datée de sa fin, pas du vidage de la file.
    @Test func dwell_reusesItsSessionId_onEveryAttempt() {
        let first = StampedSocialEvent.stamping(.dwell(session()), at: occurredAt.addingTimeInterval(3_600))
        let retry = StampedSocialEvent.stamping(.dwell(session()), at: occurredAt.addingTimeInterval(7_200))

        #expect(first.stamp == retry.stamp)
        #expect(first.stamp.eventId == "11111111-2222-3333-4444-555555555555")
        #expect(first.stamp.occurredAt == occurredAt.addingTimeInterval(4))
    }

    @Test func dwell_withAnUppercaseSessionId_isLowercased() {
        let stamp = SocialEventStamp.of(session(id: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"))
        #expect(stamp.eventId == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    }

    @Test func dwellWithoutEnvelope_decodesWithItsSessionId() throws {
        let data = try JSONEncoder.iso.encode(SocialEvent.dwell(session()))

        let decoded = try JSONDecoder.iso.decode(StampedSocialEvent.self, from: data)

        #expect(decoded.stamp.eventId == "11111111-2222-3333-4444-555555555555")
    }

    @Test func stableEventId_ofAMutationId_isItsUuid() {
        #expect(SocialEventStamp.stableEventId(from: "cmid_0f8fad5b-d9cb-469f-a165-70867728950e") == "0f8fad5b-d9cb-469f-a165-70867728950e")
    }

    @Test func stableEventId_ofANonUuidKey_isAStableUuid() {
        let one = SocialEventStamp.stableEventId(from: "session-legacy-42")
        let again = SocialEventStamp.stableEventId(from: "session-legacy-42")
        let other = SocialEventStamp.stableEventId(from: "session-legacy-43")

        #expect(one == again)
        #expect(one != other)
        #expect(UUID(uuidString: one) != nil)
        #expect(one == one.lowercased())
    }
}

@Suite("PostService.recordSocialEvents — l'enveloppe part sur le fil")
struct PostServiceStampedSocialEventsTests {

    private func receiptStub() throws -> APIResponse<SocialEventsReceipt> {
        let data = Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8)
        return try JSONDecoder().decode(APIResponse<SocialEventsReceipt>.self, from: data)
    }

    @Test func body_carriesTheEnvelope_andTheDeviceSendTime() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        let service = PostService(api: api, clock: { Date(timeIntervalSince1970: 1_700_000_060) })
        let stamped = StampedSocialEvent(
            event: .impression(postId: "p1", source: "feed", surface: .feed),
            stamp: SocialEventStamp(eventId: "0f8fad5b-d9cb-469f-a165-70867728950e", occurredAt: Date(timeIntervalSince1970: 1_700_000_000))
        )

        _ = try await service.recordSocialEvents([stamped], credential: .account)

        let body = try #require(api.lastRequest?.bodyJSON)
        let event = try #require((body["events"] as? [[String: Any]])?.first)
        #expect(event["eventId"] as? String == "0f8fad5b-d9cb-469f-a165-70867728950e")
        #expect(event["occurredAt"] as? String == "2023-11-14T22:13:20.000Z")
        #expect((body["context"] as? [String: Any])?["sentAt"] as? String == "2023-11-14T22:14:20.000Z")
    }

    /// Un échec rend le lot ; le rejeu repart avec les MÊMES identifiants.
    @Test func deliver_returnsTheUnsentWithTheirEnvelope_andTheReplayReusesIt() async throws {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        api.errorToThrow = MeeshyError.network(.noConnection)
        let service = PostService(api: api)
        let batch = [
            StampedSocialEvent.stamping(.view(postId: "p1", durationMs: nil, surface: .detail), at: Date()),
            StampedSocialEvent.stamping(.open(postId: "p2", origin: .feed), at: Date()),
        ]

        let unsent = await SocialEventsDispatch.deliver(batch, credential: .account, through: service)
        api.errorToThrow = nil
        _ = await SocialEventsDispatch.deliver(unsent, credential: .account, through: service)

        #expect(unsent == batch)
        let sentIds = api.requests.compactMap { $0.bodyJSON?["events"] as? [[String: Any]] }.map { $0.compactMap { $0["eventId"] as? String } }
        #expect(sentIds.count == 4)
        #expect(sentIds[2] == sentIds[0])
        #expect(sentIds[3] == sentIds[1])
    }
}

@Suite("ReachImpressionCollector — chaque affichage daté de son apparition")
@MainActor
struct ReachImpressionCollectorStampTests {

    @Test func occurredAt_isTheAppearanceTime_notTheFlushTime() async throws {
        let api = MockAPIClient()
        let receipt = try JSONDecoder().decode(
            APIResponse<SocialEventsReceipt>.self,
            from: Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8)
        )
        api.stub("/social/events", result: receipt)
        let clock = StampClock(now: Date(timeIntervalSince1970: 1_700_000_000))
        let sut = ReachImpressionCollector(source: "search", surface: .sound, postService: PostService(api: api), clock: { clock.now })

        sut.record("p1")
        clock.now = Date(timeIntervalSince1970: 1_700_000_900)
        await sut.flushNow()

        let event = try #require((api.lastRequest?.bodyJSON?["events"] as? [[String: Any]])?.first)
        #expect(event["occurredAt"] as? String == "2023-11-14T22:13:20.000Z")
    }
}

private extension JSONEncoder {
    static var iso: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var iso: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

@MainActor
private final class StampClock {
    nonisolated deinit {}
    var now: Date
    init(now: Date) { self.now = now }
}
