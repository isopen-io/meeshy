/// Le contrat entrant de la socket de messages : un tableau d'événements serveur, chacun avec son décodeur et sa
/// livraison. Un groupe par domaine (`MessageSocketRoutes+*.swift`), une extension du gestionnaire par canal
/// qu'elle porte (`xRoutes`). L'unicité des noms et l'égalité avec le relevé de `origin/dev` sont tenues par
/// `SocketInboundRouteTableTests`.
enum MessageSocketRoutes {

    static func all(for manager: MessageSocketManager, presentedToken: String? = nil) -> [SocketInboundRoute] {
        let groups: [[SocketInboundRoute]] = [
            messages(manager),
            manager.markRoutes,
            manager.activityRoutes,
            manager.translationRoutes,
            manager.viewOnceRoutes,
            manager.citedPostRoutes,
            manager.conversationEngagementRoutes,
            manager.callRecordingRoutes,
            manager.callControlRoutes,
            manager.callPreviewRoutes,
            manager.profileDecorRoutes,
            manager.gameStateRoutes,
            conversations(manager),
            notifications(manager, presentedToken: presentedToken),
            media(manager),
            calls(manager),
        ]
        return groups.flatMap { $0 }
    }
}

extension MessageSocketManager {

    /// Une route décodée : la charge brute reste dans la fermeture de la route, seule la valeur décodée (Sendable)
    /// franchit le saut vers le fil principal, où `deliver` la reçoit avec le gestionnaire s'il vit encore.
    func route<T: Decodable & Sendable>(
        _ event: SocketEvent,
        _ type: T.Type,
        deliver: @escaping @MainActor @Sendable (MessageSocketManager, T) -> Void
    ) -> SocketInboundRoute {
        .decoding(event, as: type, via: { [weak self] type, data, handler in
            self?.decode(type, from: data, handler: handler)
        }, deliver: { [weak self] value in
            guard let self else { return }
            deliver(self, value)
        })
    }
}
