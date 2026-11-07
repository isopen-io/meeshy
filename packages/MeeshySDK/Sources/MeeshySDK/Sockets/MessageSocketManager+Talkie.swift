import Combine
import Foundation

// Le talkie (#13935) sur la socket de messages : `talkie:incoming`, `talkie:chunk` et `talkie:ended`, tous sur la room
// `user:<id>` (`packages/shared/types/socketio-events/talkie-event-names.ts`). Les trois passent par la MÊME voie
// ordonnée (`SocketPayloadDecoder`) : un fragment n'arrive jamais avant la prise de parole qui l'annonce.

public extension Notification.Name {
    /// `talkie:incoming` — l'objet de la notification est un `TalkieIncoming`.
    static let talkieIncoming = Notification.Name("me.meeshy.talkieIncoming")
    /// `talkie:chunk` — l'objet est un `TalkieChunk`.
    static let talkieChunk = Notification.Name("me.meeshy.talkieChunk")
    /// `talkie:ended` — l'objet est un `TalkieEnded`.
    static let talkieEnded = Notification.Name("me.meeshy.talkieEnded")
}

/// Les trois flux du talkie, typés. Un écran s'y abonne ; il n'a pas à connaître `NotificationCenter`.
public enum TalkieEvents {
    public static var incoming: AnyPublisher<TalkieIncoming, Never> { publisher(.talkieIncoming) }
    public static var chunk: AnyPublisher<TalkieChunk, Never> { publisher(.talkieChunk) }
    public static var ended: AnyPublisher<TalkieEnded, Never> { publisher(.talkieEnded) }

    private static func publisher<Event>(_ name: Notification.Name) -> AnyPublisher<Event, Never> {
        NotificationCenter.default.publisher(for: name)
            .compactMap { $0.object as? Event }
            .eraseToAnyPublisher()
    }
}

extension MessageSocketRoutes {

    static func talkie(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            m.route(.talkieIncoming, TalkieIncoming.self) { _, event in
                NotificationCenter.default.post(name: .talkieIncoming, object: event)
            },
            .raw(.talkieChunk) { data in
                guard let chunk = TalkieChunk(wire: data.first) else { return }
                SocketPayloadDecoder.deliverInOrder(chunk) { value in
                    NotificationCenter.default.post(name: .talkieChunk, object: value)
                }
            },
            m.route(.talkieEnded, TalkieEnded.self) { _, event in
                NotificationCenter.default.post(name: .talkieEnded, object: event)
            },
        ]
    }
}
