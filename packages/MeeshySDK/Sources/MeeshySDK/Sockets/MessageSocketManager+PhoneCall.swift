import Combine
import Foundation

// « En appel » (#18753) sur la socket de messages : `phone-call:started` et `phone-call:ended`, dans la room
// `user:<id>` (`packages/shared/types/socketio-events/phone-call-event-names.ts`). Aucun événement montant : le
// téléphone rapporte par `POST /me/device/call`.

public extension Notification.Name {
    /// `phone-call:started` — l'objet est un `PhoneCallStarted`.
    static let phoneCallStarted = Notification.Name("me.meeshy.phoneCallStarted")
    /// `phone-call:ended` — l'objet est un `PhoneCallEnded`.
    static let phoneCallEnded = Notification.Name("me.meeshy.phoneCallEnded")
}

/// Les deux flux d'« en appel », typés. Un écran s'y abonne sans connaître `NotificationCenter`.
public enum PhoneCallEvents {
    public static var started: AnyPublisher<PhoneCallStarted, Never> { publisher(.phoneCallStarted) }
    public static var ended: AnyPublisher<PhoneCallEnded, Never> { publisher(.phoneCallEnded) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func phoneCall(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.phoneCallStarted, PhoneCallStarted.self) { _, event in
                NotificationCenter.default.post(name: .phoneCallStarted, object: event)
            },
            m.route(.phoneCallEnded, PhoneCallEnded.self) { _, event in
                NotificationCenter.default.post(name: .phoneCallEnded, object: event)
            },
        ]
    }
}
