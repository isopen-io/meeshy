import Foundation

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #10632
// ajoute `profile:decor-updated`. Responsabilité tenue ici : le décor de profil
// (contour d'avatar, bannière de design) équipé depuis un AUTRE de mes appareils.

public extension Notification.Name {
    /// `profile:decor-updated` — l'objet de la notification est un `ProfileDecorUpdatedEvent`.
    static let profileDecorUpdated = Notification.Name("me.meeshy.profileDecorUpdated")
}

extension MessageSocketManager {

    var profileDecorRoutes: [SocketInboundRoute] {
        [
            route(.profileDecorUpdated, ProfileDecorUpdatedEvent.self) { _, event in
                Task { @MainActor in AuthManager.shared.apply(event) }
                NotificationCenter.default.post(name: .profileDecorUpdated, object: event)
            },
        ]
    }
}
