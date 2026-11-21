import Combine
import Foundation
import SocketIO

// #8433 · #8438 · #8439 — les contrôles d'un appel EN COURS, vus du socket :
// inviter une personne, couper le micro d'un participant, réagir. Miroir de
// `packages/shared/types/call-controls.ts`. La passerelle décide qui a le
// droit ; ce fichier émet les verbes, rend leur accusé et relaie les trois
// diffusions. Dans son propre fichier : `MessageSocketManager.swift` est hors
// budget, la table des routes n'y porte que `callControlRoutes`.

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

/// `call:conversation-changed` (#19650) — l'appel lancé en tête-à-tête vit
/// désormais dans un groupe, trouvé ou créé à la première invitation. Le média
/// continue : la signalisation est adressée par `callId`. La conversation
/// d'origine reste intacte ; un titre `nil` se compose depuis les membres.
public struct CallConversationChangedEvent: Decodable, Sendable, Equatable {
    public let callId: String
    public let conversationId: String
    public let previousConversationId: String?
    public let conversationTitle: String?
    public let memberUserIds: [String]
    public let created: Bool

    public init(
        callId: String,
        conversationId: String,
        previousConversationId: String?,
        conversationTitle: String?,
        memberUserIds: [String],
        created: Bool
    ) {
        self.callId = callId
        self.conversationId = conversationId
        self.previousConversationId = previousConversationId
        self.conversationTitle = conversationTitle
        self.memberUserIds = memberUserIds
        self.created = created
    }

    private enum CodingKeys: String, CodingKey {
        case callId, conversationId, previousConversationId, conversationTitle, memberUserIds, created
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callId = try container.decode(String.self, forKey: .callId)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        previousConversationId = try container.decodeIfPresent(String.self, forKey: .previousConversationId)
        conversationTitle = try container.decodeIfPresent(String.self, forKey: .conversationTitle)
        memberUserIds = try container.decodeIfPresent([String].self, forKey: .memberUserIds) ?? []
        created = try container.decodeIfPresent(Bool.self, forKey: .created) ?? false
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
    case conversationChanged(CallConversationChangedEvent)

    public var callId: String {
        switch self {
        case .participantInvited(let event): return event.callId
        case .inviteDeclined(let event), .inviteExpired(let event): return event.callId
        case .mutedByModerator(let event): return event.callId
        case .reactionReceived(let event): return event.callId
        case .conversationChanged(let event): return event.callId
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

    var callControlRoutes: [SocketInboundRoute] {
        let controls: [SocketInboundRoute] = [
            relayCallControl(.callParticipantInvited, CallParticipantInvitedEvent.self) { .participantInvited($0) },
            relayCallControl(.callInviteDeclined, CallInviteSettledEvent.self) { .inviteDeclined($0) },
            relayCallControl(.callInviteExpired, CallInviteSettledEvent.self) { .inviteExpired($0) },
            relayCallControl(.callMutedByModerator, CallMutedByModeratorEvent.self) { .mutedByModerator($0) },
            relayCallControl(.callReactionReceived, CallReactionReceivedEvent.self) { .reactionReceived($0) },
            relayCallControl(.callConversationChanged, CallConversationChangedEvent.self) { .conversationChanged($0) },
        ]
        return controls + callLiveFrameRoutes
    }

    private func relayCallControl<T: Decodable & Sendable>(_ event: SocketEvent, _ type: T.Type, _ wrap: @escaping @Sendable (T) -> CallControlSocketEvent) -> SocketInboundRoute {
        route(event, type) { _, value in CallControlSocketChannel.events.send(wrap(value)) }
    }

    public func inviteCallParticipant(callId: String, userId: String) async throws {
        try await emitCallControl(.callInviteParticipant, ["callId": callId, "userId": userId])
    }

    public func muteCallParticipant(callId: String, targetUserId: String) async throws {
        try await emitCallControl(.callMuteParticipant, ["callId": callId, "targetUserId": targetUserId])
    }

    public func sendCallReaction(callId: String, emoji: CallReactionEmoji) async throws {
        try await emitCallControl(.callReaction, ["callId": callId, "emoji": emoji.rawValue])
    }

    private func emitCallControl(_ event: SocketEvent, _ payload: [String: Any]) async throws {
        guard let socket else { throw CallControlRefusal(code: "NO_SOCKET") }
        let ack = await socket.emitWithAck(event, payload, as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 10)
        if let refusal = Self.callControlRefusal(ack) { throw refusal }
    }

    /// `nil` pour `{ success: true }` ; tout le reste (dont l'échéance, que
    /// Socket.IO rend en `"NO ACK"`) est un refus.
    static func callControlRefusal(_ ack: SocketAck<SocketAckNoPayload>) -> CallControlRefusal? {
        switch ack {
        case .accepted: return nil
        case .timedOut: return CallControlRefusal(code: "TIMEOUT")
        case .refused(let refusal): return CallControlRefusal(code: refusal.code ?? "MALFORMED_ACK")
        case .acceptedWithoutPayload, .undecodable: return CallControlRefusal(code: "MALFORMED_ACK")
        }
    }
}
