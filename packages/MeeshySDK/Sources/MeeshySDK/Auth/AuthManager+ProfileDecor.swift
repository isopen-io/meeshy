import Foundation

// MARK: - Le décor de MON compte, repeint d'où que vienne l'événement (#10715)

extension MeeshyUser {
    /// `profile:decor-updated` appliqué à CE compte ; `nil` si l'événement vise un autre compte ou ne change rien.
    public func applying(_ event: ProfileDecorUpdatedEvent) -> MeeshyUser? {
        guard id == event.userId, profileDecor != event.decor else { return nil }
        return withProfileDecor(event.decor)
    }
}

extension AuthManager {
    /// Mon décor équipé depuis un AUTRE de mes appareils : le compte connecté se repeint
    /// quel que soit l'écran ouvert — le socket l'appelle, aucune vue n'a à le monter.
    public func apply(_ event: ProfileDecorUpdatedEvent) {
        guard let repainted = currentUser?.applying(event) else { return }
        currentUser = repainted
    }
}
