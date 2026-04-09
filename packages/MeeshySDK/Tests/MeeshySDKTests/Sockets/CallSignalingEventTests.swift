import XCTest
@testable import MeeshySDK

/// Point 50: Call signaling event struct decoding tests
final class CallSignalingEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    // MARK: - CallOfferData

    func test_callOfferData_decodingAllFields() throws {
        let json = """
        {
            "callId": "call123",
            "conversationId": "conv456",
            "mode": "video",
            "initiator": {
                "userId": "u1",
                "username": "alice",
                "avatar": "https://cdn.meeshy.me/avatars/alice.jpg"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallOfferData.self, from: json)
        XCTAssertEqual(data.callId, "call123")
        XCTAssertEqual(data.conversationId, "conv456")
        XCTAssertEqual(data.mode, "video")
        XCTAssertEqual(data.initiator.userId, "u1")
        XCTAssertEqual(data.initiator.username, "alice")
        XCTAssertEqual(data.initiator.avatar, "https://cdn.meeshy.me/avatars/alice.jpg")
    }

    func test_callOfferData_decodingWithNilOptionals() throws {
        let json = """
        {
            "callId": "call789",
            "conversationId": "conv101",
            "initiator": {
                "userId": "u2",
                "username": "bob"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallOfferData.self, from: json)
        XCTAssertEqual(data.callId, "call789")
        XCTAssertNil(data.mode)
        XCTAssertEqual(data.initiator.username, "bob")
        XCTAssertNil(data.initiator.avatar)
    }

    func test_callOfferData_audioMode() throws {
        let json = """
        {
            "callId": "c1",
            "conversationId": "cv1",
            "mode": "audio",
            "initiator": {"userId": "u1", "username": "charlie"}
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallOfferData.self, from: json)
        XCTAssertEqual(data.mode, "audio")
    }

    // MARK: - CallAnswerData

    func test_callAnswerData_decodingWithSDP() throws {
        let json = """
        {
            "callId": "call123",
            "signal": {
                "type": "answer",
                "sdp": "v=0\\r\\no=- 12345 2 IN IP4 127.0.0.1",
                "from": "u2",
                "to": "u1"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallAnswerData.self, from: json)
        XCTAssertEqual(data.callId, "call123")
        XCTAssertEqual(data.signal.type, "answer")
        XCTAssertNotNil(data.signal.sdp)
        XCTAssertNil(data.signal.candidate)
        XCTAssertEqual(data.signal.from, "u2")
        XCTAssertEqual(data.signal.to, "u1")
    }

    func test_callAnswerData_decodingMinimal() throws {
        let json = """
        {
            "callId": "c2",
            "signal": {
                "type": "offer"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallAnswerData.self, from: json)
        XCTAssertEqual(data.callId, "c2")
        XCTAssertEqual(data.signal.type, "offer")
        XCTAssertNil(data.signal.sdp)
        XCTAssertNil(data.signal.candidate)
        XCTAssertNil(data.signal.sdpMLineIndex)
        XCTAssertNil(data.signal.sdpMid)
        XCTAssertNil(data.signal.from)
        XCTAssertNil(data.signal.to)
    }

    // MARK: - CallICECandidateData

    func test_callICECandidateData_decodingAllFields() throws {
        let json = """
        {
            "callId": "call123",
            "signal": {
                "type": "candidate",
                "candidate": "candidate:842163049 1 udp 2113937151 192.168.1.1 5000 typ host",
                "sdpMLineIndex": 0,
                "sdpMid": "audio"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallICECandidateData.self, from: json)
        XCTAssertEqual(data.callId, "call123")
        XCTAssertEqual(data.signal.type, "candidate")
        XCTAssertEqual(data.signal.candidate, "candidate:842163049 1 udp 2113937151 192.168.1.1 5000 typ host")
        XCTAssertEqual(data.signal.sdpMLineIndex, 0)
        XCTAssertEqual(data.signal.sdpMid, "audio")
    }

    func test_callICECandidateData_decodingWithNilCandidate() throws {
        let json = """
        {
            "callId": "c3",
            "signal": {
                "type": "candidate"
            }
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallICECandidateData.self, from: json)
        XCTAssertEqual(data.callId, "c3")
        XCTAssertNil(data.signal.candidate)
        XCTAssertNil(data.signal.sdpMLineIndex)
        XCTAssertNil(data.signal.sdpMid)
    }

    // MARK: - CallEndData

    func test_callEndData_decodingAllFields() throws {
        let json = """
        {
            "callId": "call123",
            "duration": 300,
            "endedBy": "u1"
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallEndData.self, from: json)
        XCTAssertEqual(data.callId, "call123")
        XCTAssertEqual(data.duration, 300)
        XCTAssertEqual(data.endedBy, "u1")
    }

    func test_callEndData_decodingWithNilOptionals() throws {
        let json = """
        {"callId": "call456"}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallEndData.self, from: json)
        XCTAssertEqual(data.callId, "call456")
        XCTAssertNil(data.duration)
        XCTAssertNil(data.endedBy)
    }

    func test_callEndData_zeroDuration() throws {
        let json = """
        {"callId": "c4", "duration": 0, "endedBy": "system"}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallEndData.self, from: json)
        XCTAssertEqual(data.duration, 0)
        XCTAssertEqual(data.endedBy, "system")
    }

    // MARK: - CallParticipantData

    func test_callParticipantData_decodingAllFields() throws {
        let json = """
        {
            "callId": "call1",
            "participantId": "p1",
            "userId": "u1",
            "mode": "video"
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallParticipantData.self, from: json)
        XCTAssertEqual(data.callId, "call1")
        XCTAssertEqual(data.participantId, "p1")
        XCTAssertEqual(data.userId, "u1")
        XCTAssertEqual(data.mode, "video")
    }

    func test_callParticipantData_decodingMinimal() throws {
        let json = """
        {"callId": "call2"}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallParticipantData.self, from: json)
        XCTAssertEqual(data.callId, "call2")
        XCTAssertNil(data.participantId)
        XCTAssertNil(data.userId)
        XCTAssertNil(data.mode)
    }

    // MARK: - CallMediaToggleData

    func test_callMediaToggleData_decodingAudioMute() throws {
        let json = """
        {
            "callId": "call1",
            "participantId": "p1",
            "mediaType": "audio",
            "enabled": false
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallMediaToggleData.self, from: json)
        XCTAssertEqual(data.callId, "call1")
        XCTAssertEqual(data.participantId, "p1")
        XCTAssertEqual(data.mediaType, "audio")
        XCTAssertFalse(data.enabled)
    }

    func test_callMediaToggleData_decodingVideoEnable() throws {
        let json = """
        {
            "callId": "call1",
            "mediaType": "video",
            "enabled": true
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallMediaToggleData.self, from: json)
        XCTAssertEqual(data.mediaType, "video")
        XCTAssertTrue(data.enabled)
        XCTAssertNil(data.participantId)
    }

    // MARK: - CallErrorData

    func test_callErrorData_decodingAllFields() throws {
        let json = """
        {"code": "PEER_UNREACHABLE", "message": "Could not connect to peer"}
        """.data(using: .utf8)!

        let data = try decoder.decode(CallErrorData.self, from: json)
        XCTAssertEqual(data.code, "PEER_UNREACHABLE")
        XCTAssertEqual(data.message, "Could not connect to peer")
    }

    func test_callErrorData_decodingWithNilFields() throws {
        let json = "{}".data(using: .utf8)!

        let data = try decoder.decode(CallErrorData.self, from: json)
        XCTAssertNil(data.code)
        XCTAssertNil(data.message)
    }

    // MARK: - CallSignalPayload (shared by Answer and ICE)

    func test_callSignalPayload_decodingFullOffer() throws {
        let json = """
        {
            "type": "offer",
            "sdp": "v=0\\r\\no=- 1234 2 IN IP4 0.0.0.0\\r\\n",
            "from": "initiator-id",
            "to": "responder-id"
        }
        """.data(using: .utf8)!

        let payload = try decoder.decode(CallSignalPayload.self, from: json)
        XCTAssertEqual(payload.type, "offer")
        XCTAssertNotNil(payload.sdp)
        XCTAssertEqual(payload.from, "initiator-id")
        XCTAssertEqual(payload.to, "responder-id")
    }
}
