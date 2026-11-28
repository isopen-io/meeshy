import Foundation

/// #20726 — la seule lecture d'une `Duration` en secondes : secondes entières plus
/// attosecondes. Un intervalle négatif reste négatif.
public extension Duration {
    nonisolated var timeInterval: TimeInterval {
        let parts = components
        return TimeInterval(parts.seconds) + TimeInterval(parts.attoseconds) / 1e18
    }
}
