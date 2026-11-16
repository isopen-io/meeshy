import Combine
import Foundation

// Le téléphone injoignable (#18737) sur la socket de messages : `phone:unreachable` et `phone:reachable`, dans la room
// `user:<id>` (`packages/shared/types/socketio-events/phone-reachability-event-names.ts`). Aucun événement montant :
// le signe de vie du téléphone est sa connexion, son relevé de batterie ou `POST /me/device/alive`.

public extension Notification.Name {
    /// `phone:unreachable` — l'objet est un `PhoneReachabilityChanged`.
    static let phoneUnreachable = Notification.Name("me.meeshy.phoneUnreachable")
    /// `phone:reachable` — l'objet est un `PhoneReachabilityCleared`.
    static let phoneReachable = Notification.Name("me.meeshy.phoneReachable")
}

/// Les deux flux du téléphone injoignable, typés. Un écran s'y abonne sans connaître `NotificationCenter`.
public enum PhoneReachabilityEvents {
    public static var unreachable: AnyPublisher<PhoneReachabilityChanged, Never> { publisher(.phoneUnreachable) }
    public static var reachable: AnyPublisher<PhoneReachabilityCleared, Never> { publisher(.phoneReachable) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func phoneReachability(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.phoneUnreachable, PhoneReachabilityChanged.self) { _, event in
                NotificationCenter.default.post(name: .phoneUnreachable, object: event)
            },
            m.route(.phoneReachable, PhoneReachabilityCleared.self) { _, event in
                NotificationCenter.default.post(name: .phoneReachable, object: event)
            },
        ]
    }
}
