import Foundation
import SocketIO

typealias SocketAckPayload = any SocketData

protocol SocketAckEmitting: AnyObject {
    func sendAck(_ event: String, _ payload: SocketAckPayload, timeout: Double, onAck: @escaping ([Any]) -> Void)
}

extension SocketIOClient: SocketAckEmitting {
    func sendAck(_ event: String, _ payload: SocketAckPayload, timeout: Double, onAck: @escaping ([Any]) -> Void) {
        emitWithAck(event, payload).timingOut(after: timeout, callback: onAck)
    }
}

extension SocketAckEmitting {

    func emitWithAck<P: Decodable & Sendable>(
        _ event: SocketEvent,
        _ payload: SocketAckPayload,
        as payloadType: P.Type,
        payloadAt source: SocketAckPayloadSource,
        timingOutAfter timeout: Double,
        decoder: JSONDecoder = JSONDecoder()
    ) async -> SocketAck<P> {
        await withCheckedContinuation { (continuation: CheckedContinuation<SocketAck<P>, Never>) in
            var resumed = false
            sendAck(event.rawValue, payload, timeout: timeout) { items in
                guard !resumed else { return }
                resumed = true
                continuation.resume(returning: SocketAck<P>.parse(items.first, payloadAt: source, decoder: decoder))
            }
        }
    }
}
