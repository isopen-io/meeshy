import Combine
import Foundation

// Le Bring (#13936) sur la socket de messages : `bring:ring` chez le destinataire, `bring:stopped` chez les DEUX,
// tous deux sur la room `user:<id>` (`packages/shared/types/socketio-events/relation-event-names.ts`). Aucun
// événement n'annonce l'expiration : chaque client cesse de sonner à `expiresAt`. Socket ET push partent tous deux :
// le consommateur dédoublonne par `bringId`.

public extension Notification.Name {
    /// `bring:ring` — l'objet de la notification est un `BringRing`.
    static let bringRing = Notification.Name("me.meeshy.bringRing")
    /// `bring:stopped` — l'objet est un `BringStopped`.
    static let bringStopped = Notification.Name("me.meeshy.bringStopped")
}

/// Les deux flux du Bring, typés. Un écran s'y abonne ; il n'a pas à connaître `NotificationCenter`.
public enum BringEvents {
    public static var ring: AnyPublisher<BringRing, Never> {
        publisher(.bringRing)
    }

    public static var stopped: AnyPublisher<BringStopped, Never> {
        publisher(.bringStopped)
    }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func bring(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.bringRing, BringRing.self) { _, event in
                NotificationCenter.default.post(name: .bringRing, object: event)
            },
            m.route(.bringStopped, BringStopped.self) { _, event in
                NotificationCenter.default.post(name: .bringStopped, object: event)
            },
        ]
    }
}
