import Testing
import Foundation
@testable import MeeshySDK

@Suite("SocketAck — le mappage propre à chaque site d'émission")
struct SocketAckSiteMappingTests {

    private func sendAck(_ response: Any?) -> MessageSocketManager.SendMessageAck? {
        let ack = SocketAck<SendMessageAckBody>.parse(response, payloadAt: .data)
        return MessageSocketManager.sendMessageAck(from: ack, requestCid: "cid-1")
    }

    private func initiate(_ response: Any?) -> Result<MessageSocketManager.CallInitiateAck, MessageSocketManager.CallInitiateError> {
        MessageSocketManager.callInitiateResult(from: SocketAck<CallInitiateAckBody>.parse(response, payloadAt: .data))
    }

    private func join(_ response: Any?) -> MessageSocketManager.CallJoinAckResult {
        MessageSocketManager.callJoinResult(from: SocketAck<SocketAckNoPayload>.parse(response, payloadAt: .none))
    }

    private func serverMessage(_ result: Result<MessageSocketManager.CallInitiateAck, MessageSocketManager.CallInitiateError>) -> String? {
        guard case .failure(.serverError(let message)) = result else { return nil }
        return message
    }

    // MARK: - message:send

    @Test("sendMessageAck : sans clientMessageId, l'identifiant de la requête est rendu")
    func sendMessageAck_withoutClientMessageId_fallsBackToRequestCid() {
        let ack = sendAck(["success": true, "data": ["messageId": "m1"]] as [String: Any])
        #expect(ack?.messageId == "m1")
        #expect(ack?.clientMessageId == "cid-1")
        #expect(ack?.createdAt == nil)
    }

    @Test("sendMessageAck : un clientMessageId numérique est toléré")
    func sendMessageAck_numericClientMessageId_fallsBackToRequestCid() {
        let ack = sendAck(["success": true, "data": ["messageId": "m1", "clientMessageId": 42]] as [String: Any])
        #expect(ack?.clientMessageId == "cid-1")
    }

    @Test("sendMessageAck : l'écho du serveur et sa date sont repris")
    func sendMessageAck_echoAndCreatedAt_areCarried() {
        let ack = sendAck([
            "success": true,
            "data": ["messageId": "m1", "clientMessageId": "cid-9", "createdAt": "2026-10-07T22:00:00.000Z"]
        ] as [String: Any])
        #expect(ack?.clientMessageId == "cid-9")
        #expect(ack?.createdAt == WireDate.date(from: "2026-10-07T22:00:00.000Z"))
    }

    @Test("sendMessageAck : refus et échéance rendent nil")
    func sendMessageAck_refusedOrTimedOut_isNil() {
        #expect(sendAck(["success": false, "error": "x"] as [String: Any]) == nil)
        #expect(sendAck("NO ACK") == nil)
        #expect(sendAck(["success": true, "data": ["clientMessageId": "c"]] as [String: Any]) == nil)
    }

    // MARK: - call:initiate

    @Test("callInitiateResult : data sans callId est « unknown error »")
    func callInitiateResult_dataWithoutCallId_isUnknownError() {
        #expect(serverMessage(initiate(["success": true, "data": ["mode": "p2p"]] as [String: Any])) == "unknown error")
    }

    @Test("callInitiateResult : le message du serveur est repris, objet ou chaîne")
    func callInitiateResult_refusal_carriesTheServerMessage() {
        #expect(serverMessage(initiate(["success": false, "error": ["message": "busy"]] as [String: Any])) == "busy")
        #expect(serverMessage(initiate(["success": false, "error": "gone"] as [String: Any])) == "gone")
        #expect(serverMessage(initiate(["success": false] as [String: Any])) == "unknown error")
    }

    @Test("callInitiateResult : des serveurs ICE mal formés rendent malformedResponse")
    func callInitiateResult_malformedIceServers_isMalformedResponse() {
        let response: [String: Any] = ["success": true, "data": ["callId": "k1", "iceServers": [["urls": 42]]]]
        guard case .failure(.malformedResponse) = initiate(response) else {
            Issue.record("attendu .malformedResponse")
            return
        }
    }

    @Test("callInitiateResult : un ttl illisible reste un succès sans ttl, et iceServers absent vaut []")
    func callInitiateResult_tolerantFields_stillSucceed() throws {
        let response: [String: Any] = ["success": true, "data": ["callId": "k1", "mode": "sfu", "ttl": "x"]]
        let ack = try initiate(response).get()
        #expect(ack.callId == "k1")
        #expect(ack.mode == "sfu")
        #expect(ack.ttl == nil)
        #expect(ack.iceServers.isEmpty)
    }

    @Test("callInitiateResult : les serveurs ICE et le ttl sont repris")
    func callInitiateResult_iceServersAndTtl_areCarried() throws {
        let response: [String: Any] = [
            "success": true,
            "data": ["callId": "k1", "ttl": 600, "iceServers": [["urls": "stun:s.example", "username": "u", "credential": "c"]]]
        ]
        let ack = try initiate(response).get()
        #expect(ack.ttl == 600)
        #expect(ack.iceServers.count == 1)
        #expect(ack.iceServers.first?.username == "u")
    }

    @Test("callInitiateResult : une échéance est timeout")
    func callInitiateResult_timedOut_isTimeout() {
        guard case .failure(.timeout) = initiate("NO ACK") else {
            Issue.record("attendu .timeout")
            return
        }
    }

    // MARK: - call:join

    @Test("callJoinResult : accepté")
    func callJoinResult_accepted_isJoined() {
        let result = join(["success": true] as [String: Any])
        #expect(result.joined)
        #expect(result.errorCode == nil)
        #expect(result.endReason == nil)
    }

    @Test("callJoinResult : CALL_ENDED porte sa raison")
    func callJoinResult_callEnded_carriesEndReason() {
        let result = join(["success": false, "error": ["code": "CALL_ENDED", "endReason": "completed"]] as [String: Any])
        #expect(!result.joined)
        #expect(result.errorCode == "CALL_ENDED")
        #expect(result.endReason == "completed")
    }

    @Test("callJoinResult : une échéance n'est ni jointe ni codée")
    func callJoinResult_timedOut_hasNoCode() {
        let result = join("NO ACK")
        #expect(!result.joined)
        #expect(result.errorCode == nil)
        #expect(result.endReason == nil)
    }

    // MARK: - Booléens

    @Test("ackSucceeded : seul success == true réussit")
    func ackSucceeded_onlyBooleanTrueSucceeds() {
        func succeeded(_ response: Any?) -> Bool {
            MessageSocketManager.ackSucceeded(SocketAck<SocketAckNoPayload>.parse(response, payloadAt: .none))
        }
        #expect(succeeded(["success": true] as [String: Any]))
        #expect(!succeeded(["success": false] as [String: Any]))
        #expect(!succeeded("NO ACK"))
    }

    // MARK: - Réactions sociales

    @Test("réaction de post refusée : la limite du jour passe avant la phrase du serveur")
    func postReactionEvent_dailyLimit_throwsDailyGestureLimit() {
        let ack = SocketAck<SocketPostReactionUpdateEvent>.parse(
            ["success": false, "code": "DAILY_REACTION_LIMIT", "limit": 5] as [String: Any], payloadAt: .data
        )
        #expect(throws: DailyGestureLimit(gesture: .reaction, resetAt: nil, limit: 5)) {
            try SocialSocketManager.postReactionEvent(from: ack, postId: "p1", emoji: "❤️", action: "add")
        }
    }

    @Test("réaction de commentaire : une échéance est timeout")
    func commentReactionEvent_timedOut_throwsTimeout() {
        let ack = SocketAck<SocketCommentReactionUpdateEvent>.parse("NO ACK", payloadAt: .data)
        #expect(throws: SocialSocketManager.CommentReactionError.self) {
            try SocialSocketManager.commentReactionEvent(from: ack, commentId: "c1", postId: "p1", emoji: "👍", action: "add")
        }
    }

    @Test("synchronisation de réactions refusée : la phrase du serveur est reprise")
    func postReactionSyncEvent_refused_carriesTheServerMessage() {
        let ack = SocketAck<SocketPostReactionSyncEvent>.parse(
            ["success": false, "error": ["message": "Post not found"]] as [String: Any], payloadAt: .data
        )
        do {
            _ = try SocialSocketManager.postReactionSyncEvent(from: ack)
            Issue.record("attendu une erreur")
        } catch SocialSocketManager.PostReactionError.serverError(let message) {
            #expect(message == "Post not found")
        } catch {
            Issue.record("erreur inattendue \(error)")
        }
    }

    @Test("synchronisation de réactions : un data illisible est malformedResponse")
    func commentReactionSyncEvent_undecodable_throwsMalformedResponse() {
        let ack = SocketAck<SocketCommentReactionSyncEvent>.parse(
            ["success": true, "data": ["foo": 1]] as [String: Any], payloadAt: .data
        )
        #expect(throws: SocialSocketManager.CommentReactionError.self) {
            try SocialSocketManager.commentReactionSyncEvent(from: ack)
        }
    }
}
