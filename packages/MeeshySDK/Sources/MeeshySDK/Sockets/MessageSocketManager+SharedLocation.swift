import Combine
import Foundation

// Le partage temporaire de position (#14109, #16983) sur la socket de messages : `location:share-changed`,
// `location:share-ended` et `location:share-own-changed` (#18578), sur la room `user:<id>` (`packages/shared/types/socketio-events/shared-location-event-names.ts`).
// Chaque charge est déjà tronquée par la passerelle à la précision que l'émetteur a donnée à CE lecteur.

public extension Notification.Name {
    /// `location:share-changed` — l'objet de la notification est un `SharedLocationChanged`.
    static let sharedLocationChanged = Notification.Name("me.meeshy.sharedLocationChanged")
    /// `location:share-ended` — l'objet est un `SharedLocationEnded`.
    static let sharedLocationEnded = Notification.Name("me.meeshy.sharedLocationEnded")
    /// `location:share-own-changed` — MON partage a changé sur la passerelle (un autre appareil du compte a pu le faire).
    static let sharedLocationOwnChanged = Notification.Name("me.meeshy.sharedLocationOwnChanged")
}

/// Les deux flux du partage de position, typés. Un écran s'y abonne ; il n'a pas à connaître `NotificationCenter`.
public enum SharedLocationEvents {
    public static var changed: AnyPublisher<SharedLocationChanged, Never> { publisher(.sharedLocationChanged) }
    public static var ended: AnyPublisher<SharedLocationEnded, Never> { publisher(.sharedLocationEnded) }
    /// Sans charge : l'appareil relit `GET /relations/locations/mine` et s'y recale (#18389, #18578).
    public static var ownChanged: AnyPublisher<Void, Never> {
        NotificationCenter.default.publisher(for: .sharedLocationOwnChanged).map { _ in () }.eraseToAnyPublisher()
    }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func sharedLocation(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.locationShareChanged, SharedLocationChanged.self) { _, event in
                NotificationCenter.default.post(name: .sharedLocationChanged, object: event)
            },
            m.route(.locationShareEnded, SharedLocationEnded.self) { _, event in
                NotificationCenter.default.post(name: .sharedLocationEnded, object: event)
            },
            m.route(.locationShareOwnChanged, SharedLocationOwnChanged.self) { _, _ in
                NotificationCenter.default.post(name: .sharedLocationOwnChanged, object: nil)
            },
        ]
    }
}
