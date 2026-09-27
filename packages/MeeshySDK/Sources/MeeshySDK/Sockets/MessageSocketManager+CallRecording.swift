import Combine
import Foundation
import SocketIO

// #8064 — le consentement à l'enregistrement d'un appel, vu du socket. Dans
// son propre fichier : `MessageSocketManager.swift` est hors budget de taille,
// il n'y porte que la ligne `registerCallRecordingHandlers(on:)`.
//
// La passerelle est l'AUTORITÉ (`CallRecordingService`) : ce fichier ne
// décide rien. Il émet les trois verbes (demander, répondre, arrêter), rend
// leur accusé, et relaie les trois diffusions de la room de l'appel.

/// `call:recording-requested` — quelqu'un veut enregistrer ; chaque
/// participant de `requiredUserIds` doit répondre avant l'échéance.
public struct CallRecordingRequestedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let recordingId: String
    public let requesterId: String
    public let requiredUserIds: [String]

    public init(callId: String, recordingId: String, requesterId: String, requiredUserIds: [String]) {
        self.callId = callId
        self.recordingId = recordingId
        self.requesterId = requesterId
        self.requiredUserIds = requiredUserIds
    }
}

/// `call:recording-started` — tous ont consenti ; seul `recorderId` capte.
public struct CallRecordingStartedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let recordingId: String
    public let recorderId: String

    public init(callId: String, recordingId: String, recorderId: String) {
        self.callId = callId
        self.recordingId = recordingId
        self.recorderId = recorderId
    }
}

/// `call:recording-stopped` — la demande ou l'enregistrement a pris fin, et
/// `reason` dit pourquoi (`refused`, `timeout`, `participant-joined`,
/// `stopped`, `requester-left`, `call-ended`).
public struct CallRecordingStoppedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let recordingId: String
    public let reason: String
    public let byUserId: String?
    public let wasRecording: Bool

    public init(callId: String, recordingId: String, reason: String, byUserId: String?, wasRecording: Bool) {
        self.callId = callId
        self.recordingId = recordingId
        self.reason = reason
        self.byUserId = byUserId
        self.wasRecording = wasRecording
    }
}

public enum CallRecordingSocketEvent: Sendable, Equatable {
    case requested(CallRecordingRequestedEvent)
    case started(CallRecordingStartedEvent)
    case stopped(CallRecordingStoppedEvent)

    public var callId: String {
        switch self {
        case .requested(let event): return event.callId
        case .started(let event): return event.callId
        case .stopped(let event): return event.callId
        }
    }
}

/// Le refus d'un verbe : `code` est l'un des `CALL_RECORDING_ERROR_CODES` de
/// la passerelle, ou `NO_SOCKET` / `TIMEOUT` / `MALFORMED_ACK` quand la
/// réponse n'est jamais arrivée entière.
public struct CallRecordingRefusal: Error, Sendable, Equatable {
    public let code: String

    public init(code: String) {
        self.code = code
    }
}

public protocol CallRecordingSocketProviding: AnyObject, Sendable {
    var callRecordingEvents: AnyPublisher<CallRecordingSocketEvent, Never> { get }
    func requestCallRecording(callId: String) async throws -> String
    func answerCallRecording(callId: String, recordingId: String, accepted: Bool) async throws
    func stopCallRecording(callId: String, recordingId: String) async throws
}

/// Les diffusions ne peuvent pas vivre en propriété stockée d'une extension :
/// elles vivent ici, une fois pour le processus, comme le socket lui-même.
public enum CallRecordingSocketChannel {
    nonisolated(unsafe) public static let events = PassthroughSubject<CallRecordingSocketEvent, Never>()
}

extension MessageSocketManager: CallRecordingSocketProviding {

    public var callRecordingEvents: AnyPublisher<CallRecordingSocketEvent, Never> {
        CallRecordingSocketChannel.events.eraseToAnyPublisher()
    }

    func registerCallRecordingHandlers(on socket: SocketIOClient) {
        socket.on("call:recording-requested") { [weak self] data, _ in
            self?.decode(CallRecordingRequestedEvent.self, from: data) { event in
                CallRecordingSocketChannel.events.send(.requested(event))
            }
        }
        socket.on("call:recording-started") { [weak self] data, _ in
            self?.decode(CallRecordingStartedEvent.self, from: data) { event in
                CallRecordingSocketChannel.events.send(.started(event))
            }
        }
        socket.on("call:recording-stopped") { [weak self] data, _ in
            self?.decode(CallRecordingStoppedEvent.self, from: data) { event in
                CallRecordingSocketChannel.events.send(.stopped(event))
            }
        }
    }

    public func requestCallRecording(callId: String) async throws -> String {
        try await emitCallRecording("call:recording-request", ["callId": callId])
    }

    public func answerCallRecording(callId: String, recordingId: String, accepted: Bool) async throws {
        _ = try await emitCallRecording(
            "call:recording-consent",
            ["callId": callId, "recordingId": recordingId, "accepted": accepted]
        )
    }

    public func stopCallRecording(callId: String, recordingId: String) async throws {
        _ = try await emitCallRecording("call:recording-stop", ["callId": callId, "recordingId": recordingId])
    }

    private func emitCallRecording(_ event: String, _ payload: [String: Any]) async throws -> String {
        guard let socket else { throw CallRecordingRefusal(code: "NO_SOCKET") }
        return try await withCheckedThrowingContinuation { continuation in
            socket.emitWithAck(event, payload).timingOut(after: 10) { items in
                switch Self.callRecordingAck(items.first) {
                case .success(let recordingId): continuation.resume(returning: recordingId)
                case .failure(let refusal): continuation.resume(throwing: refusal)
                }
            }
        }
    }

    /// `{ success: true, recordingId }` ou `{ success: false, code }` — tout
    /// autre forme (dont l'échéance, que Socket.IO rend en `"NO ACK"`) est un
    /// refus : rien ne se croit accepté sans que la passerelle l'ait dit.
    static func callRecordingAck(_ item: Any?) -> Result<String, CallRecordingRefusal> {
        guard let response = item as? [String: Any] else {
            return .failure(CallRecordingRefusal(code: "TIMEOUT"))
        }
        guard response["success"] as? Bool == true else {
            return .failure(CallRecordingRefusal(code: response["code"] as? String ?? "MALFORMED_ACK"))
        }
        guard let recordingId = response["recordingId"] as? String else {
            return .failure(CallRecordingRefusal(code: "MALFORMED_ACK"))
        }
        return .success(recordingId)
    }
}
