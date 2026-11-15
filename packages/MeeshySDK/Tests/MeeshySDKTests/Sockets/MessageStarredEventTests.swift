import Foundation
import Testing
@testable import MeeshySDK

/// #7939 — `message:starred`, charge `MessageStarredEventData`
/// (`packages/shared/types/socketio-events/message.ts`), telle que la passerelle
/// l'émet vers la room `user:<id>` depuis `routes/me/starred-messages.ts`.
struct MessageStarredEventTests {

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        return decoder
    }()

    @Test func placedStar_decodesItsServerInstant() throws {
        let json = #"{"messageId":"m1","conversationId":"c1","starred":true,"starredAt":"2026-09-25T10:00:00.000Z"}"#
        let event = try decoder.decode(MessageStarredEvent.self, from: Data(json.utf8))
        #expect(event.messageId == "m1")
        #expect(event.conversationId == "c1")
        #expect(event.starred)
        #expect(event.starredAt == WireDate.date(from: "2026-09-25T10:00:00.000Z"))
    }

    @Test func removedStar_decodesANullInstant() throws {
        let json = #"{"messageId":"m1","conversationId":"c1","starred":false,"starredAt":null}"#
        let event = try decoder.decode(MessageStarredEvent.self, from: Data(json.utf8))
        #expect(!event.starred)
        #expect(event.starredAt == nil)
    }
}
