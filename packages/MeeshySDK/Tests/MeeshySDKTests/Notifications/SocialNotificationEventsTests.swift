import Foundation
import Testing
@testable import MeeshySDK

/// #10507 — l'entonnoir des notifications : reçue (extension), affichée,
/// ouverte, écartée. Jamais une conversation en parent.
@Suite("SocialNotificationEvents — reçue, affichée, ouverte, écartée")
struct SocialNotificationEventsTests {

    private static let now = Date(timeIntervalSince1970: 1_760_000_000)

    @Test func aNotificationOnAPost_namesItAsParent() throws {
        let event = try #require(SocialNotificationEvents.event(.opened, userInfo: ["notificationId": "n1", "type": "post_comment", "postId": "p1", "conversationId": "c1"], at: Self.now))
        #expect(event.type == "notification")
        #expect(event.action == "opened")
        #expect(event.target == SocialTarget(kind: .notification, id: "n1", parent: SocialTargetRef(kind: .post, id: "p1")))
        #expect(event.surface == .notifications)
    }

    @Test func aMessageNotification_hasNoParent_andNoIdMeansNoEvent() throws {
        let message = try #require(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "n2", "type": "new_message", "conversationId": "c1"], at: Self.now))
        #expect(message.target?.parent == nil)
        #expect(SocialNotificationEvents.event(.received, userInfo: ["type": "new_message"], at: Self.now) == nil)
    }

    @Test func received_carriesTheDeliveryLatency() throws {
        let event = try #require(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "n3", "createdAt": "2025-10-09T08:53:17.500Z"], at: Date(timeIntervalSince1970: 1_759_999_999)))
        guard case .notification(let notification) = event.payload else { Issue.record("pas une notification"); return }
        #expect(notification.deliveryLatencyMs == 1_500)
        #expect(notification.channel == .apns)
    }

    @Test func theInbox_appendsThenDrainsOnce() throws {
        let inbox = SocialNotificationInbox(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("inbox-\(UUID().uuidString).jsonl"))
        let first = try #require(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "a"], at: Self.now))
        let second = try #require(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "b"], at: Self.now))
        inbox.append(first)
        inbox.append(second)

        let drained = inbox.drain()
        let ids = drained.compactMap { (try? JSONSerialization.jsonObject(with: $0) as? [String: Any])?["eventId"] as? String }
        #expect(ids == [first.eventId, second.eventId])
        #expect(inbox.drain().isEmpty)
    }

    @Test func drainedEvents_enterTheOutbox_underTheirOwnEventId() async throws {
        let outbox = SocialEventsV2Outbox(dbPath: nil, clock: { Self.now })
        let event = try #require(SocialNotificationEvents.event(.received, userInfo: ["notificationId": "a"], at: Self.now))
        let data = try #require(try SocialEventsV2Wire.encode(event))
        await outbox.enqueue(encoded: [data, data, Data("{}".utf8)], owner: "u1")
        #expect(await outbox.pendingEventIds(owner: "u1") == [event.eventId])
    }
}
