import Combine
import Foundation
import SocketIO

// L'écoute partagée (#13934, #16755) sur la socket de messages : `now-playing:changed` et `now-playing:cleared`, sur la
// room `user:<id>` (`packages/shared/types/socketio-events/now-playing-event-names.ts`). Chaque charge est déjà
// tronquée par la passerelle au niveau du lecteur.

public extension Notification.Name {
    /// `now-playing:changed` — l'objet de la notification est un `NowPlayingChanged`.
    static let nowPlayingChanged = Notification.Name("me.meeshy.nowPlayingChanged")
    /// `now-playing:cleared` — l'objet est un `NowPlayingCleared`.
    static let nowPlayingCleared = Notification.Name("me.meeshy.nowPlayingCleared")
}

/// Les deux flux de l'écoute partagée, typés. Un écran s'y abonne ; il n'a pas à connaître `NotificationCenter`.
public enum NowPlayingEvents {
    public static var changed: AnyPublisher<NowPlayingChanged, Never> { publisher(.nowPlayingChanged) }
    public static var cleared: AnyPublisher<NowPlayingCleared, Never> { publisher(.nowPlayingCleared) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func nowPlaying(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.nowPlayingChanged, NowPlayingChanged.self) { _, event in
                NotificationCenter.default.post(name: .nowPlayingChanged, object: event)
            },
            m.route(.nowPlayingCleared, NowPlayingCleared.self) { _, event in
                NotificationCenter.default.post(name: .nowPlayingCleared, object: event)
            },
        ]
    }
}

// MARK: - Émettre (#16803)

/// Qui publie MON écoute : `now-playing:update` (état complet) et `now-playing:clear`. L'app ne voit pas la socket.
public protocol NowPlayingEmitting: AnyObject, Sendable {
    func publishNowPlaying(_ update: NowPlayingUpdate) async -> NowPlayingPublishOutcome
    func clearNowPlaying() async
}

/// L'émission de l'écoute sur la socket de messages : un type à part, qui ne fait que porter deux événements et lire
/// leur accusé — la socket de messages n'en grossit pas.
public final class NowPlayingSocketEmitter: NowPlayingEmitting {
    public static let shared = NowPlayingSocketEmitter(manager: .shared)

    private let manager: MessageSocketManager

    init(manager: MessageSocketManager) {
        self.manager = manager
    }

    public func publishNowPlaying(_ update: NowPlayingUpdate) async -> NowPlayingPublishOutcome {
        guard let socket = manager.socket, socket.status == .connected else { return .offline }
        let ack = await socket.emitWithAck(
            .nowPlayingUpdate, update.wirePayload, as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 10
        )
        return Self.outcome(ack)
    }

    public func clearNowPlaying() async {
        guard let socket = manager.socket, socket.status == .connected else { return }
        _ = await socket.emitWithAck(
            .nowPlayingClear, [String: String](), as: SocketAckNoPayload.self, payloadAt: .none, timingOutAfter: 10
        )
    }

    /// L'accusé lu : seul `{ success: true }` est un envoi accepté ; l'échéance de l'accusé vaut hors ligne.
    static func outcome(_ ack: SocketAck<SocketAckNoPayload>) -> NowPlayingPublishOutcome {
        switch ack {
        case .accepted, .acceptedWithoutPayload: return .accepted
        case .timedOut: return .offline
        case .refused(let refusal): return refusal.code == "NOW_PLAYING_RATE_LIMITED" ? .rateLimited : .refused
        case .undecodable: return .refused
        }
    }
}
