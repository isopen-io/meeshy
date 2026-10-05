import XCTest
@testable import MeeshySDK

/// #9214 — le cadre en direct d'un appel à deux vu du socket : la charge envoyée
/// suit la loi de forme de la passerelle, et la diffusion se décode.
final class CallLiveFrameSocketTests: XCTestCase {

    private func decode(_ json: String) throws -> CallLiveFrameSelectedEvent {
        try JSONDecoder().decode(CallLiveFrameSelectedEvent.self, from: Data(json.utf8))
    }

    func test_selected_withFrameAndTexts_decodes() throws {
        let event = try decode(#"{"callId":"c1","userId":"u2","frameId":"jovial.fete.duo","texts":{"name":"Léa"},"at":"2026-10-03T10:00:00.000Z"}"#)

        XCTAssertEqual(event, CallLiveFrameSelectedEvent(callId: "c1", userId: "u2", frameId: "jovial.fete.duo", texts: CallLiveFrameTexts(name: "Léa")))
    }

    func test_selected_nullFrame_decodesAsRemoval() throws {
        let event = try decode(#"{"callId":"c1","userId":"u2","frameId":null,"at":"2026-10-03T10:00:00.000Z"}"#)

        XCTAssertNil(event.frameId)
        XCTAssertNil(event.texts)
    }

    func test_payload_removal_sendsAnExplicitNull() {
        let payload = MessageSocketManager.callLiveFramePayload(callId: "c1", frameId: nil, texts: nil)

        XCTAssertTrue(payload["frameId"] is NSNull)
        XCTAssertNil(payload["texts"])
    }

    func test_payload_dropsEmptyTexts_andTrimsTheRest() {
        let payload = MessageSocketManager.callLiveFramePayload(
            callId: "c1",
            frameId: "jovial.fete.duo",
            texts: CallLiveFrameTexts(name: "  Léa ", city: "   ")
        )

        XCTAssertEqual(payload["frameId"] as? String, "jovial.fete.duo")
        XCTAssertEqual(payload["texts"] as? [String: String], ["name": "Léa"])
    }

    func test_payload_boundsTextsToTheGatewayLimit() {
        let long = String(repeating: "a", count: 200)
        let payload = MessageSocketManager.callLiveFramePayload(callId: "c1", frameId: "a.b", texts: CallLiveFrameTexts(name: long))

        XCTAssertEqual((payload["texts"] as? [String: String])?["name"]?.count, CallLiveFrameTexts.maxLength)
    }

    func test_payload_withoutAnyText_omitsTheKey() {
        let payload = MessageSocketManager.callLiveFramePayload(callId: "c1", frameId: "a.b", texts: CallLiveFrameTexts())

        XCTAssertNil(payload["texts"])
    }

    // MARK: - #9287 — proposer, accepter, refuser

    func test_selected_withReply_decodesTheAnswer() throws {
        let event = try decode(#"{"callId":"c1","userId":"u2","frameId":"jovial.fete.duo","reply":"declined","at":"2026-10-04T10:00:00.000Z"}"#)

        XCTAssertEqual(event.reply, .declined)
        XCTAssertEqual(event.frameId, "jovial.fete.duo")
    }

    func test_selected_unknownReply_keepsTheEventWithoutAnswer() throws {
        let event = try decode(#"{"callId":"c1","userId":"u2","frameId":"jovial.fete.duo","reply":"maybe","at":"2026-10-04T10:00:00.000Z"}"#)

        XCTAssertNil(event.reply)
        XCTAssertEqual(event.frameId, "jovial.fete.duo")
    }

    func test_payload_proposal_carriesNoReply() {
        let payload = MessageSocketManager.callLiveFramePayload(callId: "c1", frameId: "a.b", texts: nil)

        XCTAssertNil(payload["reply"])
    }

    func test_payload_answer_carriesTheReply() {
        let payload = MessageSocketManager.callLiveFramePayload(callId: "c1", frameId: "a.b", texts: CallLiveFrameTexts(name: "Léa"), reply: .accepted)

        XCTAssertEqual(payload["reply"] as? String, "accepted")
        XCTAssertEqual(payload["texts"] as? [String: String], ["name": "Léa"])
    }
}
