/// Une ligne du contrat entrant d'une socket : l'événement que la passerelle émet, et ce que le client en fait.
/// `receive` reçoit la charge brute de Socket.IO (jamais Sendable) et ne la fait pas sortir de sa fermeture :
/// seule la valeur décodée, elle Sendable, franchit le saut vers le fil principal.
struct SocketInboundRoute: Sendable {
    let event: SocketEvent
    let receive: @Sendable ([Any]) -> Void

    static func raw(_ event: SocketEvent, _ receive: @escaping @Sendable ([Any]) -> Void) -> SocketInboundRoute {
        SocketInboundRoute(event: event, receive: receive)
    }

    static func decoding<T: Decodable & Sendable>(
        _ event: SocketEvent,
        as type: T.Type,
        via decode: @escaping @Sendable (T.Type, [Any], @escaping @MainActor @Sendable (T) -> Void) -> Void,
        deliver: @escaping @MainActor @Sendable (T) -> Void
    ) -> SocketInboundRoute {
        SocketInboundRoute(event: event) { data in decode(type, data, deliver) }
    }

    func observing(_ arrival: @escaping @Sendable ([Any]) -> Void) -> SocketInboundRoute {
        let delivery = receive
        return SocketInboundRoute(event: event) { data in
            arrival(data)
            delivery(data)
        }
    }
}
