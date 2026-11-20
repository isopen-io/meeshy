import Combine
import Foundation

// La chute détectée (#18748) sur la socket de messages : `fall:detected` et `fall:cleared`, dans la room `user:<Sang>`
// (`packages/shared/types/socketio-events/fall-event-names.ts`). Aucun événement montant : l'iPhone rapporte par
// `POST /me/health/fall`.

public extension Notification.Name {
    /// `fall:detected` — l'objet est un `FallDetected`.
    static let fallDetected = Notification.Name("me.meeshy.fallDetected")
    /// `fall:cleared` — l'objet est un `FallCleared`.
    static let fallCleared = Notification.Name("me.meeshy.fallCleared")
}

/// Les deux flux de la chute détectée, typés. Un écran s'y abonne sans connaître `NotificationCenter`.
public enum FallEvents {
    public static var detected: AnyPublisher<FallDetected, Never> { publisher(.fallDetected) }
    public static var cleared: AnyPublisher<FallCleared, Never> { publisher(.fallCleared) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func fall(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.fallDetected, FallDetected.self) { _, event in
                NotificationCenter.default.post(name: .fallDetected, object: event)
            },
            m.route(.fallCleared, FallCleared.self) { _, event in
                NotificationCenter.default.post(name: .fallCleared, object: event)
            },
        ]
    }
}
