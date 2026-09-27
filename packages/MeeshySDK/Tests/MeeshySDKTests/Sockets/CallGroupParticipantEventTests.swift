import XCTest
@testable import MeeshySDK

/// #3585 — `call:participant-joined` porte l'arrivant SOUS `participant`
/// (`CallParticipantJoinedEvent`, `packages/shared/types/video-call.ts`) ; le
/// décodeur ne lisait que la forme plate, et l'identité de l'arrivant d'un
/// appel de groupe était perdue.
final class CallGroupParticipantEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    func test_participantJoined_nestedParticipant_exposesIdentityAndMedia() throws {
        let json = """
        {
            "callId": "call1",
            "mode": "p2p",
            "participant": {
                "id": "cp1",
                "callSessionId": "call1",
                "userId": "u2",
                "role": "participant",
                "isAudioEnabled": false,
                "isVideoEnabled": true,
                "username": "bob",
                "displayName": "Bob Martin",
                "avatar": "https://cdn.meeshy.me/bob.jpg"
            },
            "iceServers": [{"urls": "stun:stun.meeshy.me"}]
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallParticipantData.self, from: json)

        XCTAssertEqual(data.userId, "u2")
        XCTAssertEqual(data.displayName, "Bob Martin")
        XCTAssertEqual(data.username, "bob")
        XCTAssertEqual(data.avatar, "https://cdn.meeshy.me/bob.jpg")
        XCTAssertEqual(data.isAudioEnabled, false)
        XCTAssertEqual(data.isVideoEnabled, true)
        XCTAssertEqual(data.mode, "p2p")
        XCTAssertEqual(data.iceServers?.count, 1)
    }

    func test_participantLeft_flatShape_stillDecodes() throws {
        let json = """
        {"callId": "call1", "participantId": "p9", "userId": "u9", "mode": "p2p"}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallParticipantData.self, from: json)

        XCTAssertEqual(data.userId, "u9")
        XCTAssertEqual(data.participantId, "p9")
        XCTAssertNil(data.displayName)
        XCTAssertNil(data.isAudioEnabled)
    }

    func test_participantJoined_flatUserIdWins_overNested() throws {
        let json = """
        {"callId": "c", "userId": "flat", "participant": {"userId": "nested"}}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallParticipantData.self, from: json)

        XCTAssertEqual(data.userId, "flat")
    }

    func test_callInitiated_groupCall_exposesConversationTypeAndTitle() throws {
        let json = """
        {
            "callId": "c",
            "conversationId": "conv",
            "mode": "p2p",
            "type": "audio",
            "initiator": {"userId": "u1", "username": "alice"},
            "conversationType": "group",
            "conversationTitle": "Équipe design"
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallOfferData.self, from: json)

        XCTAssertEqual(data.conversationType, "group")
        XCTAssertEqual(data.conversationTitle, "Équipe design")
    }

    func test_callInitiated_olderGateway_leavesConversationTypeNil() throws {
        let json = """
        {"callId": "c", "conversationId": "conv", "initiator": {"userId": "u1", "username": "alice"}}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallOfferData.self, from: json)

        XCTAssertNil(data.conversationType)
        XCTAssertNil(data.conversationTitle)
    }

    func test_mediaToggled_carriesUserId() throws {
        let json = """
        {"callId": "c", "participantId": "p1", "userId": "u1", "mediaType": "screen", "enabled": true}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallMediaToggleData.self, from: json)

        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.mediaType, "screen")
        XCTAssertTrue(data.enabled)
    }
}
