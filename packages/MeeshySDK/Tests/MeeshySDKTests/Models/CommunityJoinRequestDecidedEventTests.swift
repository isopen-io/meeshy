import Combine
import Foundation
import Testing
@testable import MeeshySDK

/// `community:join-request-decided` (#19948) — décodé depuis la charge RÉELLE
/// de l'émetteur (`services/gateway/src/services/community-join-request-decided.ts`,
/// #19879), et `currentUserJoinRetryAt` servi par `GET /communities/:id`.
struct CommunityJoinRequestDecidedEventTests {

    private static func decode(_ payload: [String: Any]) throws -> CommunityJoinRequestDecidedEvent {
        try JSONDecoder().decode(CommunityJoinRequestDecidedEvent.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private static func community(_ extra: String) -> APICommunity {
        let json = """
        {"id":"c1","identifier":"mshy_c1","name":"Alpha","isPrivate":false,
         "createdBy":"u","createdAt":"2026-09-01T10:00:00.000Z"\(extra)}
        """
        return try! MeeshyCoders.decoder(.api).decode(APICommunity.self, from: Data(json.utf8))
    }

    private static let now = WireDate.date(from: "2026-11-20T10:00:00.000Z")!

    @Test func aRefusalDecodesAndNamesItsRetryDate() throws {
        let event = try Self.decode([
            "communityId": "c1", "decision": "rejected",
            "retryAt": "2026-11-27T10:00:00.000Z", "at": "2026-11-20T10:00:00.000Z",
        ])

        #expect(event.communityId == "c1")
        #expect(event.refusedUntil == WireDate.date(from: "2026-11-27T10:00:00.000Z"))
    }

    @Test func anUnknownDecisionOrAnUnreadableDateSaysNothing() {
        let unknown = CommunityJoinRequestDecidedEvent(communityId: "c1", decision: "accepted", retryAt: "2026-11-27T10:00:00.000Z", at: "x")
        let unreadable = CommunityJoinRequestDecidedEvent(communityId: "c1", decision: "rejected", retryAt: "demain", at: "x")
        let anonymous = CommunityJoinRequestDecidedEvent(communityId: "", decision: "rejected", retryAt: "2026-11-27T10:00:00.000Z", at: "x")

        #expect(unknown.refusedUntil == nil)
        #expect(unreadable.refusedUntil == nil)
        #expect(anonymous.refusedUntil == nil)
    }

    @Test func aPayloadMissingItsRetryDateDoesNotDecode() {
        #expect(throws: (any Error).self) {
            try Self.decode(["communityId": "c1", "decision": "rejected", "at": "2026-11-20T10:00:00.000Z"])
        }
    }

    @Test func theChannelPublishesOnlyAReadableRefusal() {
        let channel = CommunityJoinRequestChannel()
        var received: [String] = []
        let subscription = channel.decided.sink { received.append($0.communityId) }

        channel.publish(CommunityJoinRequestDecidedEvent(communityId: "c1", decision: "rejected", retryAt: "2026-11-27T10:00:00.000Z", at: "x"))
        channel.publish(CommunityJoinRequestDecidedEvent(communityId: "c2", decision: "rejected", retryAt: "jamais", at: "x"))
        subscription.cancel()

        #expect(received == ["c1"])
    }

    @Test func theServedRetryDateHoldsTheRefusalUntilItPasses() {
        let community = Self.community(#","currentUserJoinRetryAt":"2026-11-27T10:00:00.000Z""#)

        #expect(community.currentUserJoinRetryAt == "2026-11-27T10:00:00.000Z")
        #expect(community.joinDeclinedUntil(now: Self.now) == WireDate.date(from: "2026-11-27T10:00:00.000Z"))
        #expect(community.joinDeclinedUntil(now: WireDate.date(from: "2026-11-28T10:00:00.000Z")!) == nil)
    }

    @Test func aMemberOrAPendingRequestIsNeverDeclined() {
        let member = Self.community(#","currentUserRole":"member","currentUserJoinRetryAt":"2026-11-27T10:00:00.000Z""#)
        let pending = Self.community(#","currentUserJoinRequest":"pending","currentUserJoinRetryAt":"2026-11-27T10:00:00.000Z""#)

        #expect(member.joinDeclinedUntil(now: Self.now) == nil)
        #expect(pending.joinDeclinedUntil(now: Self.now) == nil)
    }

    @Test func anOldServerWithoutTheFieldDeclinesNothing() {
        let community = Self.community("")

        #expect(community.currentUserJoinRetryAt == nil)
        #expect(community.joinDeclinedUntil(now: Self.now) == nil)
    }
}
