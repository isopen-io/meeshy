import Foundation
import SocketIO

// #9617 — la déclaration d'une capture, vue du socket. Dans son propre fichier :
// `MessageSocketManager.swift` est hors budget de taille.

/// Un refus d'ensemble de la passerelle (`UNAUTHENTICATED`, `VALIDATION_ERROR`,
/// `NOT_A_PARTICIPANT`, `RATE_LIMITED`, `CONVERSATION_CLOSED`), une échéance
/// (`TIMEOUT`) ou une absence de socket (`NO_SOCKET`).
public struct ContentCaptureRefusal: Error, Sendable, Equatable {
    public let code: String

    public init(code: String) {
        self.code = code
    }

    /// Un refus qui ne changera pas en réessayant par l'autre transport.
    public var isFinal: Bool {
        ["UNAUTHENTICATED", "VALIDATION_ERROR", "NOT_A_PARTICIPANT", "RATE_LIMITED", "CONVERSATION_CLOSED"].contains(code)
            || code.hasPrefix("HTTP_4")
    }
}

extension MessageSocketManager {

    /// `message:capture-detected` — rend les messages pour lesquels un avis
    /// EXISTE désormais (`noticedMessageIds`).
    public func emitContentCapture(_ report: ContentCaptureReport) async throws -> [String] {
        guard let socket, isConnected else { throw ContentCaptureRefusal(code: "NO_SOCKET") }
        let ack = await socket.emitWithAck(
            .messageCaptureDetected, report.socketPayload,
            as: ContentCaptureAckBody.self, payloadAt: .data, timingOutAfter: 10
        )
        return try Self.contentCaptureAck(ack).get()
    }

    /// `{ success: true, data: { noticedMessageIds } }` ou `{ success: false, code }` —
    /// toute autre forme (dont l'échéance, que Socket.IO rend en `"NO ACK"`)
    /// est un refus : rien ne se croit annoncé sans que la passerelle l'ait dit.
    static func contentCaptureAck(_ ack: SocketAck<ContentCaptureAckBody>) -> Result<[String], ContentCaptureRefusal> {
        switch ack {
        case .accepted(let body): return .success(body.noticedMessageIds)
        case .timedOut: return .failure(ContentCaptureRefusal(code: "TIMEOUT"))
        case .refused(let refusal): return .failure(ContentCaptureRefusal(code: refusal.code ?? "MALFORMED_ACK"))
        case .acceptedWithoutPayload, .undecodable: return .failure(ContentCaptureRefusal(code: "MALFORMED_ACK"))
        }
    }
}

struct ContentCaptureAckBody: Decodable, Sendable {
    let noticedMessageIds: [String]
}
