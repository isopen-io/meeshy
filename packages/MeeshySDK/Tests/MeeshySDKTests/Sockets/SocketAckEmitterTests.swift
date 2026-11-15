import Testing
import Foundation
@testable import MeeshySDK

final class FakeAckEmitter: SocketAckEmitting {
    private(set) var sentEvents: [String] = []
    private(set) var sentTimeouts: [Double] = []
    private let replies: [Any]

    init(replies: [Any]) {
        self.replies = replies
    }

    func sendAck(_ event: String, _ payload: SocketAckPayload, timeout: Double, onAck: @escaping ([Any]) -> Void) {
        sentEvents.append(event)
        sentTimeouts.append(timeout)
        replies.forEach { onAck([$0]) }
    }
}

@Suite("SocketAckEmitting — l'émission avec accusé, une seule fois")
struct SocketAckEmitterTests {

    @Test("l'émetteur reçoit le nom de fil et le délai demandés")
    func emitWithAck_messageSend_forwardsWireNameAndTimeout() async {
        let emitter = FakeAckEmitter(replies: [["success": true, "data": ["messageId": "m1"]] as [String: Any]])
        let ack = await emitter.emitWithAck(
            .messageSend, ["conversationId": "c1"] as [String: Any],
            as: MessageIdBody.self, payloadAt: .data, timingOutAfter: 7
        )
        #expect(emitter.sentEvents == ["message:send"])
        #expect(emitter.sentTimeouts == [7])
        #expect(ack == .accepted(MessageIdBody(messageId: "m1")))
    }

    @Test("un émetteur qui rappelle deux fois ne reprend qu'une fois")
    func emitWithAck_doubleCallback_resumesOnlyOnce() async {
        let emitter = FakeAckEmitter(replies: [
            ["success": true, "data": ["messageId": "m1"]] as [String: Any],
            "NO ACK"
        ])
        let ack = await emitter.emitWithAck(
            .messageSend, ["conversationId": "c1"] as [String: Any],
            as: MessageIdBody.self, payloadAt: .data, timingOutAfter: 10
        )
        #expect(ack == .accepted(MessageIdBody(messageId: "m1")))
    }

    @Test("une échéance se lit comme une échéance")
    func emitWithAck_noAck_isTimedOut() async {
        let emitter = FakeAckEmitter(replies: ["NO ACK"])
        let ack = await emitter.emitWithAck(
            .callEnd, ["callId": "k1"] as [String: Any],
            as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 3
        )
        #expect(ack == .timedOut)
    }
}
