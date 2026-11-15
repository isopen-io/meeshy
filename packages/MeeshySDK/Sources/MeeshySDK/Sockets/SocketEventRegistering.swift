import SocketIO

/// Ce que la table des routes exige d'un transport : inscrire UN écouteur par nom d'événement. Un faux l'enregistre
/// sans réseau ; `SocketIOClient` le fait pour de vrai.
protocol SocketEventRegistering: AnyObject {
    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void)
}

extension SocketIOClient: SocketEventRegistering {
    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        on(event) { data, _ in receive(data) }
    }
}

extension SocketEventRegistering {
    func install(_ routes: [SocketInboundRoute]) {
        for route in routes {
            listen(route.event.rawValue) { data in route.receive(data) }
        }
    }
}
