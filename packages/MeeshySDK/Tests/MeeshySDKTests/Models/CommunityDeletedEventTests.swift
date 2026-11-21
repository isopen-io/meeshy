import Combine
import Foundation
import Testing
@testable import MeeshySDK

/// `community:deleted` (#19591) — décodé depuis la charge RÉELLE de l'émetteur
/// (`services/gateway/src/services/community-deleted-broadcast.ts`), publié sur
/// `CommunityDeletedChannel` sous l'identifiant de la communauté disparue.
struct CommunityDeletedEventTests {

    private static func decode(_ payload: [String: Any]) throws -> CommunityDeletedEvent {
        try JSONDecoder().decode(CommunityDeletedEvent.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    @Test func decodesEveryKeyOfTheEmittedPayload() throws {
        let event = try Self.decode(["communityId": "c1", "reason": "deleted", "at": "2026-11-18T10:00:00.000Z"])

        #expect(event == CommunityDeletedEvent(communityId: "c1", reason: "deleted", at: "2026-11-18T10:00:00.000Z"))
        #expect(event.disappearedId == "c1")
    }

    @Test func aDeactivationNamesTheCommunityToo() throws {
        let event = try Self.decode(["communityId": "c2", "reason": "deactivated", "at": "2026-11-18T10:00:00.000Z"])

        #expect(event.reason == "deactivated")
        #expect(event.disappearedId == "c2")
    }

    @Test func aPayloadWithoutCommunityDesignatesNothing() {
        #expect(CommunityDeletedEvent(communityId: "", reason: "deleted", at: "2026-11-18T10:00:00.000Z").disappearedId == nil)
    }

    @Test func aPayloadMissingItsCommunityIdDoesNotDecode() {
        #expect(throws: (any Error).self) { try Self.decode(["reason": "deleted", "at": "2026-11-18T10:00:00.000Z"]) }
    }

    @Test func theChannelPublishesOnlyADesignatedCommunity() {
        let channel = CommunityDeletedChannel()
        var received: [String] = []
        let subscription = channel.deleted.sink { received.append($0) }

        channel.publish(CommunityDeletedEvent(communityId: "", reason: "deleted", at: "2026-11-18T10:00:00.000Z"))
        channel.publish(CommunityDeletedEvent(communityId: "c1", reason: "deleted", at: "2026-11-18T10:00:00.000Z"))

        #expect(received == ["c1"])
        subscription.cancel()
    }
}
