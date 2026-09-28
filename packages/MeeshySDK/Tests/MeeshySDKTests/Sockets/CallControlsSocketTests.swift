import XCTest
@testable import MeeshySDK

/// #8433 · #8438 · #8439 — les contrôles d'un appel en cours vus du socket :
/// chaque verbe rend l'accusé de la passerelle (`{ success }` ou
/// `{ success: false, code }`), et les trois diffusions se décodent.
final class CallControlsSocketTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func test_ack_success_isAccepted() {
        XCTAssertNil(MessageSocketManager.callControlRefusal(["success": true]))
    }

    func test_ack_refusal_carriesTheGatewayCode() {
        XCTAssertEqual(MessageSocketManager.callControlRefusal(["success": false, "code": "NOT_A_CONTACT"]), CallControlRefusal(code: "NOT_A_CONTACT"))
    }

    func test_ack_timeout_isARefusal() {
        XCTAssertEqual(MessageSocketManager.callControlRefusal("NO ACK"), CallControlRefusal(code: "TIMEOUT"))
    }

    func test_reactionEmojis_areTheGatewaysClosedList() {
        XCTAssertEqual(CallReactionEmoji.allCases.map(\.rawValue), ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉", "🔥"])
    }

    func test_participantInvited_decodesTheInvitee() throws {
        let event = try decode(
            CallParticipantInvitedEvent.self,
            #"{"callId":"c1","invitedBy":"u1","invitee":{"userId":"u2","username":"lea","displayName":"Léa","avatar":null},"participantCount":3,"isGroup":true}"#
        )

        XCTAssertEqual(event.invitee.userId, "u2")
        XCTAssertEqual(event.invitee.displayName, "Léa")
        XCTAssertEqual(event.invitedBy, "u1")
    }

    func test_mutedByModerator_decodes() throws {
        let event = try decode(CallMutedByModeratorEvent.self, #"{"callId":"c1","byUserId":"u1"}"#)

        XCTAssertEqual(event.byUserId, "u1")
    }

    func test_reactionReceived_unknownEmoji_isDropped() {
        XCTAssertNil(try? decode(CallReactionReceivedEvent.self, #"{"callId":"c1","userId":"u1","emoji":"🦄","at":"2026-09-28T00:00:00Z"}"#))
    }

    func test_reactionReceived_knownEmoji_decodes() throws {
        let event = try decode(CallReactionReceivedEvent.self, #"{"callId":"c1","userId":"u1","emoji":"🔥","at":"2026-09-28T00:00:00Z"}"#)

        XCTAssertEqual(event.emoji, .fire)
    }

    func test_callOffer_invitation_carriesTheInviter() throws {
        let offer = try decode(
            CallOfferData.self,
            #"{"callId":"c1","conversationId":"v1","initiator":{"userId":"u0","username":"sam"},"invitedBy":{"userId":"u1","username":"lea","displayName":"Léa"},"isGroup":true}"#
        )

        XCTAssertEqual(offer.invitedBy?.displayName, "Léa")
        XCTAssertEqual(offer.isGroup, true)
    }
}
