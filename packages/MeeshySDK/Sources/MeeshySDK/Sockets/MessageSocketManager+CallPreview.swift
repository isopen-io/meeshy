import Combine
import Foundation
import SocketIO

// #8480 — l'aperçu avant décroché, vu du socket : l'appelé voit (et entend,
// s'il le choisit) l'appelant pendant que l'appel 1:1 sonne. Miroir de
// `packages/shared/types/call-preview.ts`. Un canal DISTINCT de `call:signal`,
// où une réponse décrocherait l'appel. Dans son propre fichier :
// `MessageSocketManager.swift` est hors budget, il n'y porte que
// `registerCallPreviewHandlers(on:)`.

/// `call:preview-requested` — à l'appelant : `userId` voit l'appel sonner et demande l'aperçu.
public struct CallPreviewRequestedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let userId: String

    public init(callId: String, userId: String) {
        self.callId = callId
        self.userId = userId
    }
}

public enum CallPreviewSocketEvent: Sendable {
    case requested(CallPreviewRequestedEvent)
    /// `call:preview-signal` — offre, réponse ou candidat, de la forme de `call:signal`.
    case signal(CallAnswerData)
}

public enum CallPreviewSocketChannel {
    nonisolated(unsafe) public static let events = PassthroughSubject<CallPreviewSocketEvent, Never>()
}

extension MessageSocketManager {

    public var callPreviewEvents: AnyPublisher<CallPreviewSocketEvent, Never> {
        CallPreviewSocketChannel.events.eraseToAnyPublisher()
    }

    func registerCallPreviewHandlers(on socket: SocketIOClient) {
        socket.on("call:preview-requested") { [weak self] data, _ in
            self?.decode(CallPreviewRequestedEvent.self, from: data) { event in
                CallPreviewSocketChannel.events.send(.requested(event))
            }
        }
        socket.on("call:preview-signal") { [weak self] data, _ in
            self?.decode(CallAnswerData.self, from: data) { event in
                CallPreviewSocketChannel.events.send(.signal(event))
            }
        }
    }

    /// L'appelé demande l'aperçu de l'appel qui sonne.
    public func requestCallPreview(callId: String) {
        socket?.emit("call:preview-request", ["callId": callId])
    }

    /// Un signal du lien d'aperçu — `fields` porte `sdp`, ou `candidate` / `sdpMid` / `sdpMLineIndex`.
    public func emitCallPreviewSignal(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: [String: Any]) {
        socket?.emit("call:preview-signal", Self.callPreviewSignalPayload(callId: callId, type: type, from: from, to: to, negotiationId: negotiationId, fields: fields))
    }

    static func callPreviewSignalPayload(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: [String: Any]) -> [String: Any] {
        let base: [String: Any] = ["type": type, "from": from, "to": to, "negotiationId": negotiationId]
        return ["callId": callId, "signal": base.merging(fields) { current, _ in current }]
    }
}
