import Combine
import Foundation
import SocketIO

// #8433 · #8438 · #8439 — les contrôles d'un appel EN COURS, vus du socket :
// inviter une personne, couper le micro d'un participant, réagir. Miroir de
// `packages/shared/types/call-controls.ts`. La passerelle décide qui a le
// droit ; ce fichier émet les verbes, rend leur accusé et relaie les trois
// diffusions. Dans son propre fichier : `MessageSocketManager.swift` est hors
// budget, il n'y porte que `registerCallControlHandlers(on:)`.

/// Les huit réactions d'un appel — liste FERMÉE, dans l'ordre de la passerelle.
public enum CallReactionEmoji: String, CaseIterable, Sendable, Equatable, Decodable {
    case thumbsUp = "👍"
    case heart = "❤️"
    case laugh = "😂"
    case wow = "😮"
    case sad = "😢"
    case clap = "👏"
    case party = "🎉"
    case fire = "🔥"
}

public struct CallInvitedUser: Decodable, Sendable, Equatable {
    public let userId: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public init(userId: String, username: String, displayName: String?, avatar: String?) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
    }
}

/// `call:participant-invited` — une personne vient d'être invitée et sonne.
public struct CallParticipantInvitedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let invitedBy: String
    public let invitee: CallInvitedUser
    public let participantCount: Int

    public init(callId: String, invitedBy: String, invitee: CallInvitedUser, participantCount: Int) {
        self.callId = callId
        self.invitedBy = invitedBy
        self.invitee = invitee
        self.participantCount = participantCount
    }
}

/// `call:invite-declined` / `call:invite-expired` (#8470) — l'invitation de
/// `userId` s'est résolue sans décroché : refusée, ou restée sans réponse.
public struct CallInviteSettledEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let userId: String

    public init(callId: String, userId: String) {
        self.callId = callId
        self.userId = userId
    }
}

/// `call:muted-by-moderator` — à la personne visée seulement.
public struct CallMutedByModeratorEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let byUserId: String

    public init(callId: String, byUserId: String) {
        self.callId = callId
        self.byUserId = byUserId
    }
}

/// `call:reaction-received` — la réaction d'un autre participant.
public struct CallReactionReceivedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let userId: String
    public let emoji: CallReactionEmoji

    public init(callId: String, userId: String, emoji: CallReactionEmoji) {
        self.callId = callId
        self.userId = userId
        self.emoji = emoji
    }
}

public enum CallControlSocketEvent: Sendable, Equatable {
    case participantInvited(CallParticipantInvitedEvent)
    case inviteDeclined(CallInviteSettledEvent)
    case inviteExpired(CallInviteSettledEvent)
    case mutedByModerator(CallMutedByModeratorEvent)
    case reactionReceived(CallReactionReceivedEvent)

    public var callId: String {
        switch self {
        case .participantInvited(let event): return event.callId
        case .inviteDeclined(let event), .inviteExpired(let event): return event.callId
        case .mutedByModerator(let event): return event.callId
        case .reactionReceived(let event): return event.callId
        }
    }
}

/// Le refus d'un verbe : un `CALL_CONTROL_ERROR_CODES` de la passerelle, ou
/// `NO_SOCKET` / `TIMEOUT` / `MALFORMED_ACK` quand la réponse n'arrive pas.
public struct CallControlRefusal: Error, Sendable, Equatable {
    public let code: String

    public init(code: String) {
        self.code = code
    }
}

public protocol CallControlsSocketProviding: AnyObject, Sendable {
    var callControlEvents: AnyPublisher<CallControlSocketEvent, Never> { get }
    func inviteCallParticipant(callId: String, userId: String) async throws
    func muteCallParticipant(callId: String, targetUserId: String) async throws
    func sendCallReaction(callId: String, emoji: CallReactionEmoji) async throws
}

public enum CallControlSocketChannel {
    nonisolated(unsafe) public static let events = PassthroughSubject<CallControlSocketEvent, Never>()
}

extension MessageSocketManager: CallControlsSocketProviding {

    public var callControlEvents: AnyPublisher<CallControlSocketEvent, Never> {
        CallControlSocketChannel.events.eraseToAnyPublisher()
    }

    func registerCallControlHandlers(on socket: SocketIOClient) {
        socket.on("call:participant-invited") { [weak self] data, _ in
            self?.decode(CallParticipantInvitedEvent.self, from: data) { event in
                CallControlSocketChannel.events.send(.participantInvited(event))
            }
        }
        socket.on("call:invite-declined") { [weak self] data, _ in
            self?.decode(CallInviteSettledEvent.self, from: data) { event in
                CallControlSocketChannel.events.send(.inviteDeclined(event))
            }
        }
        socket.on("call:invite-expired") { [weak self] data, _ in
            self?.decode(CallInviteSettledEvent.self, from: data) { event in
                CallControlSocketChannel.events.send(.inviteExpired(event))
            }
        }
        socket.on("call:muted-by-moderator") { [weak self] data, _ in
            self?.decode(CallMutedByModeratorEvent.self, from: data) { event in
                CallControlSocketChannel.events.send(.mutedByModerator(event))
            }
        }
        socket.on("call:reaction-received") { [weak self] data, _ in
            self?.decode(CallReactionReceivedEvent.self, from: data) { event in
                CallControlSocketChannel.events.send(.reactionReceived(event))
            }
        }
    }

    public func inviteCallParticipant(callId: String, userId: String) async throws {
        try await emitCallControl("call:invite-participant", ["callId": callId, "userId": userId])
    }

    public func muteCallParticipant(callId: String, targetUserId: String) async throws {
        try await emitCallControl("call:mute-participant", ["callId": callId, "targetUserId": targetUserId])
    }

    public func sendCallReaction(callId: String, emoji: CallReactionEmoji) async throws {
        try await emitCallControl("call:reaction", ["callId": callId, "emoji": emoji.rawValue])
    }

    private func emitCallControl(_ event: String, _ payload: [String: Any]) async throws {
        guard let socket else { throw CallControlRefusal(code: "NO_SOCKET") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            socket.emitWithAck(event, payload).timingOut(after: 10) { items in
                if let refusal = Self.callControlRefusal(items.first) {
                    continuation.resume(throwing: refusal)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    /// `nil` pour `{ success: true }` ; tout le reste (dont l'échéance, que
    /// Socket.IO rend en `"NO ACK"`) est un refus.
    static func callControlRefusal(_ item: Any?) -> CallControlRefusal? {
        guard let response = item as? [String: Any] else { return CallControlRefusal(code: "TIMEOUT") }
        guard response["success"] as? Bool == true else {
            return CallControlRefusal(code: response["code"] as? String ?? "MALFORMED_ACK")
        }
        return nil
    }
}
