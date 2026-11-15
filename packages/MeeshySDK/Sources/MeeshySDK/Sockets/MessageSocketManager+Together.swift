import Combine
import Foundation
import SocketIO

// « Ensemble » (#17011, #17097) sur la socket de messages : `together:invited|started|synced|ended` entrent sur la room
// `user:<id>`, par la MÊME voie ordonnée que les autres (`SocketPayloadDecoder`) ; `together:invite|join|sync|leave`
// sortent, avec accusé (`TOGETHER_CLIENT_EVENTS`, `packages/shared/types/socketio-events/together-event-names.ts`).

public extension Notification.Name {
    /// `together:invited` — l'objet de la notification est un `TogetherInvited`.
    static let togetherInvited = Notification.Name("me.meeshy.togetherInvited")
    /// `together:started` — l'objet est un `TogetherStarted`.
    static let togetherStarted = Notification.Name("me.meeshy.togetherStarted")
    /// `together:synced` — l'objet est un `TogetherSynced`.
    static let togetherSynced = Notification.Name("me.meeshy.togetherSynced")
    /// `together:ended` — l'objet est un `TogetherEnded`.
    static let togetherEnded = Notification.Name("me.meeshy.togetherEnded")
}

/// Les quatre flux d'« ensemble », typés. Un écran s'y abonne ; il n'a pas à connaître `NotificationCenter`.
public enum TogetherEvents {
    public static var invited: AnyPublisher<TogetherInvited, Never> { publisher(.togetherInvited) }
    public static var started: AnyPublisher<TogetherStarted, Never> { publisher(.togetherStarted) }
    public static var synced: AnyPublisher<TogetherSynced, Never> { publisher(.togetherSynced) }
    public static var ended: AnyPublisher<TogetherEnded, Never> { publisher(.togetherEnded) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func together(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.togetherInvited, TogetherInvited.self) { _, event in
                NotificationCenter.default.post(name: .togetherInvited, object: event)
            },
            m.route(.togetherStarted, TogetherStarted.self) { _, event in
                NotificationCenter.default.post(name: .togetherStarted, object: event)
            },
            m.route(.togetherSynced, TogetherSynced.self) { _, event in
                NotificationCenter.default.post(name: .togetherSynced, object: event)
            },
            m.route(.togetherEnded, TogetherEnded.self) { _, event in
                NotificationCenter.default.post(name: .togetherEnded, object: event)
            },
        ]
    }
}

/// Qui porte les gestes d'« ensemble » vers la passerelle. L'app ne voit pas la socket.
public protocol TogetherEmitting: AnyObject, Sendable {
    func invite(toUserId: String, conversationId: String, attachmentId: String) async -> TogetherInviteOutcome
    func join(sessionId: String) async -> TogetherJoinOutcome
    /// L'état que le serveur a retenu, ou `nil` (refus, socket tombée) : la séance garde alors l'état précédent.
    func sync(sessionId: String, playing: Bool, positionMs: Double) async -> TogetherPlayback?
    /// Quitter, refuser ou annuler : un seul geste côté serveur.
    func leave(sessionId: String)
}

/// L'émission d'« ensemble » sur la socket de messages : un type à part, qui ne fait que porter quatre événements et
/// lire leurs accusés — la socket de messages n'en grossit pas.
public final class TogetherSocketEmitter: TogetherEmitting {
    public static let shared = TogetherSocketEmitter(manager: .shared)

    /// Un accusé qui tarde au-delà, la socket est tenue pour tombée (8 s, comme le web).
    static let ackTimeout: Double = 8

    private let manager: MessageSocketManager

    init(manager: MessageSocketManager) {
        self.manager = manager
    }

    private var live: SocketIOClient? {
        guard let socket = manager.socket, socket.status == .connected else { return nil }
        return socket
    }

    public func invite(toUserId: String, conversationId: String, attachmentId: String) async -> TogetherInviteOutcome {
        guard let socket = live else { return .offline }
        let ack = await socket.emitWithAck(
            .togetherInvite,
            ["toUserId": toUserId, "conversationId": conversationId, "attachmentId": attachmentId] as [String: Any],
            as: TogetherInvitedWire.self,
            payloadAt: .data,
            timingOutAfter: Self.ackTimeout
        )
        return TogetherInviteOutcome.read(ack)
    }

    public func join(sessionId: String) async -> TogetherJoinOutcome {
        guard let socket = live else { return .offline }
        let ack = await socket.emitWithAck(
            .togetherJoin,
            ["sessionId": sessionId] as [String: Any],
            as: TogetherStarted.self,
            payloadAt: .data,
            timingOutAfter: Self.ackTimeout
        )
        return TogetherJoinOutcome.read(ack)
    }

    public func sync(sessionId: String, playing: Bool, positionMs: Double) async -> TogetherPlayback? {
        guard let socket = live else { return nil }
        let bounded = Int(min(max(0, positionMs.isFinite ? positionMs : 0), TogetherContract.maxPositionMs).rounded())
        let ack = await socket.emitWithAck(
            .togetherSync,
            ["sessionId": sessionId, "playing": playing, "positionMs": bounded] as [String: Any],
            as: TogetherSyncAckWire.self,
            payloadAt: .data,
            timingOutAfter: Self.ackTimeout
        )
        guard case .accepted(let wire) = ack else { return nil }
        return wire.playback
    }

    public func leave(sessionId: String) {
        live?.emit(SocketEvent.togetherLeave.rawValue, ["sessionId": sessionId])
    }
}
