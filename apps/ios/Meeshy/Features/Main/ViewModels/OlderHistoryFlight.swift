import Foundation

/// #16471 — la requête réseau qui étend l'historique vers le passé, UNE à la fois.
/// La page GRDB se sert sans l'attendre ; seule une remontée qui a épuisé le cache
/// rejoint la requête en vol, au lieu d'en lancer une seconde.
@MainActor
final class OlderHistoryFlight {
    private var current: Task<Void, Never>?

    nonisolated deinit {}

    func joinOrLaunch(_ work: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        if let current { return current }
        let flight = Task { @MainActor [weak self] in
            await work()
            self?.current = nil
        }
        current = flight
        return flight
    }
}
