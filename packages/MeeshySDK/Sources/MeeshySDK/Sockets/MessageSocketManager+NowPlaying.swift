import Combine
import Foundation

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
