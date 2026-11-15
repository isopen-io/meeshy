import Foundation

/// `call:end` émis sur-le-champ, l'accusé (3 s au plus) rendu plus tard sur la
/// file du socket (D2, #11468) : le raccroché ne passe plus derrière le
/// démontage local de l'appelant.
enum CallEndEmission {
    static func emit(
        on emitter: any SocketAckEmitting,
        callId: String,
        reason: String?,
        acknowledged: @escaping @Sendable (Bool) -> Void
    ) {
        let payload = reason.map { ["callId": callId, "reason": $0] } ?? ["callId": callId]
        emitter.sendAck(SocketEvent.callEnd.rawValue, payload, timeout: 3) { items in
            let ack = SocketAck<SocketAckNoPayload>.parse(items.first, payloadAt: .none)
            acknowledged(MessageSocketManager.ackSucceeded(ack))
        }
    }
}
