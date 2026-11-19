import Combine
import Foundation

// La vérification d'inactivité (#18738) sur la socket de messages : `inactivity:alert` et `inactivity:cleared`, dans la
// room `user:<id>` (`packages/shared/types/socketio-events/inactivity-event-names.ts`). Aucun événement montant :
// l'activité est la socket du téléphone suivi, et la réponse `POST /me/wellness/ok`.

public extension Notification.Name {
    /// `inactivity:alert` — l'objet est un `InactivityAlertRaised`.
    static let inactivityAlert = Notification.Name("me.meeshy.inactivityAlert")
    /// `inactivity:cleared` — l'objet est un `InactivityAlertCleared`.
    static let inactivityCleared = Notification.Name("me.meeshy.inactivityCleared")
}

/// Les deux flux de l'alerte d'inactivité, typés. Un écran s'y abonne sans connaître `NotificationCenter`.
public enum InactivityEvents {
    public static var alert: AnyPublisher<InactivityAlertRaised, Never> { publisher(.inactivityAlert) }
    public static var cleared: AnyPublisher<InactivityAlertCleared, Never> { publisher(.inactivityCleared) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func inactivity(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.inactivityAlert, InactivityAlertRaised.self) { _, event in
                NotificationCenter.default.post(name: .inactivityAlert, object: event)
            },
            m.route(.inactivityCleared, InactivityAlertCleared.self) { _, event in
                NotificationCenter.default.post(name: .inactivityCleared, object: event)
            },
        ]
    }
}
