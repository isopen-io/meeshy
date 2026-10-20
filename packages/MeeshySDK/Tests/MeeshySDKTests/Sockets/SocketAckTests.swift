import Testing
import Foundation
@testable import MeeshySDK

struct MessageIdBody: Decodable, Sendable, Equatable {
    let messageId: String
}

struct RecordingIdBody: Decodable, Sendable, Equatable {
    let recordingId: String
}

@Suite("SocketAck — le dépouillement unique d'un accusé Socket.IO")
struct SocketAckTests {

    private func refusal<P: Decodable & Sendable>(_ ack: SocketAck<P>) -> SocketAckRefusal? {
        guard case .refused(let refusal) = ack else { return nil }
        return refusal
    }

    @Test("« NO ACK » et l'absence d'accusé sont une échéance")
    func parse_noAckOrNil_isTimedOut() {
        #expect(SocketAck<SocketAckNoPayload>.parse("NO ACK", payloadAt: .none) == .timedOut)
        #expect(SocketAck<SocketAckNoPayload>.parse(nil, payloadAt: .none) == .timedOut)
    }

    @Test("un refus porte le code de la racine, sans le confondre avec error.code")
    func parse_rootCode_isKeptApartFromErrorCode() {
        let ack = SocketAck<SocketAckNoPayload>.parse(["success": false, "code": "NOT_A_CONTACT"], payloadAt: .none)
        #expect(refusal(ack)?.code == "NOT_A_CONTACT")
        #expect(refusal(ack)?.errorCode == nil)
    }

    @Test("un refus porte error.code, endReason et error.message")
    func parse_nestedError_carriesCodeReasonAndMessage() {
        let response: [String: Any] = [
            "success": false,
            "error": ["code": "CALL_ENDED", "endReason": "completed", "message": "m"]
        ]
        let found = refusal(SocketAck<SocketAckNoPayload>.parse(response, payloadAt: .none))
        #expect(found?.errorCode == "CALL_ENDED")
        #expect(found?.endReason == "completed")
        #expect(found?.message == "m")
        #expect(found?.code == nil)
    }

    @Test("une erreur en chaîne est exposée par message")
    func parse_stringError_isTheMessage() {
        let found = refusal(SocketAck<SocketAckNoPayload>.parse(["success": false, "error": "Post not found"], payloadAt: .none))
        #expect(found?.message == "Post not found")
    }

    @Test("une limite du jour porte resetAt et limit")
    func parse_dailyLimit_carriesResetAtAndLimit() {
        let response: [String: Any] = [
            "success": false, "code": "DAILY_REACTION_LIMIT", "resetAt": "2026-10-07T22:00:00.000Z", "limit": 5
        ]
        let found = refusal(SocketAck<SocketAckNoPayload>.parse(response, payloadAt: .none))
        #expect(found?.code == "DAILY_REACTION_LIMIT")
        #expect(found?.resetAt == "2026-10-07T22:00:00.000Z")
        #expect(found?.limit == 5)
    }

    @Test("success doit être le booléen true")
    func parse_nonBooleanSuccess_isRefused() {
        #expect(refusal(SocketAck<SocketAckNoPayload>.parse(["success": "yes"], payloadAt: .none)) != nil)
        #expect(refusal(SocketAck<SocketAckNoPayload>.parse([:], payloadAt: .none)) != nil)
    }

    @Test("payloadAt .data décode data, et distingue l'absence de data d'un data illisible")
    func parse_dataSource_decodesDataObject() {
        let accepted = SocketAck<MessageIdBody>.parse(["success": true, "data": ["messageId": "m1"]], payloadAt: .data)
        #expect(accepted == .accepted(MessageIdBody(messageId: "m1")))
        let without = SocketAck<MessageIdBody>.parse(["success": true], payloadAt: .data)
        #expect(without == .acceptedWithoutPayload)
        let unreadable = SocketAck<MessageIdBody>.parse(["success": true, "data": ["foo": 1]], payloadAt: .data)
        guard case .undecodable = unreadable else {
            Issue.record("attendu .undecodable, reçu \(unreadable)")
            return
        }
    }

    @Test("payloadAt .root décode la racine de l'accusé")
    func parse_rootSource_decodesTheRoot() {
        let accepted = SocketAck<RecordingIdBody>.parse(["success": true, "recordingId": "rec-1"], payloadAt: .root)
        #expect(accepted == .accepted(RecordingIdBody(recordingId: "rec-1")))
        let missing = SocketAck<RecordingIdBody>.parse(["success": true], payloadAt: .root)
        guard case .undecodable = missing else {
            Issue.record("attendu .undecodable, reçu \(missing)")
            return
        }
    }

    @Test("payloadAt .none accepte un success sans corps")
    func parse_noneSource_acceptsBareSuccess() {
        #expect(SocketAck<SocketAckNoPayload>.parse(["success": true], payloadAt: .none) == .accepted(SocketAckNoPayload()))
    }
}
