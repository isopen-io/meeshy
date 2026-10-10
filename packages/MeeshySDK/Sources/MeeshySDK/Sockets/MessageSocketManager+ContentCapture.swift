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
        let payload = report.socketPayload
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck("message:capture-detected", payload).timingOut(after: 10) { items in
                switch Self.contentCaptureAck(items.first) {
                case .success(let noticed): continuation.resume(returning: noticed)
                case .failure(let refusal): continuation.resume(throwing: refusal)
                }
            }
        }
    }

    /// `{ success: true, data: { noticedMessageIds } }` ou `{ success: false, code }` —
    /// toute autre forme (dont l'échéance, que Socket.IO rend en `"NO ACK"`)
    /// est un refus : rien ne se croit annoncé sans que la passerelle l'ait dit.
    static func contentCaptureAck(_ item: Any?) -> Result<[String], ContentCaptureRefusal> {
        guard let response = item as? [String: Any] else {
            return .failure(ContentCaptureRefusal(code: "TIMEOUT"))
        }
        guard response["success"] as? Bool == true else {
            return .failure(ContentCaptureRefusal(code: response["code"] as? String ?? "MALFORMED_ACK"))
        }
        guard let data = response["data"] as? [String: Any], let noticed = data["noticedMessageIds"] as? [String] else {
            return .failure(ContentCaptureRefusal(code: "MALFORMED_ACK"))
        }
        return .success(noticed)
    }
}
