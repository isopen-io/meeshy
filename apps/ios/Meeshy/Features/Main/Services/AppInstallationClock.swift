import Foundation

/// **L'instant où l'installation en cours a commencé** (#10370).
///
/// Posé à la première lecture et gardé dans `UserDefaults`, que la désinstallation
/// efface : une réinstallation repart donc d'un nouvel instant. C'est ce qui sépare
/// les médias REÇUS pendant cette installation (enregistrés seuls dans l'album) de
/// ceux que la synchronisation de l'historique ramène (jamais réenregistrés seuls).
protocol AppInstallationDateProviding: AnyObject {
    var installationStartedAt: Date { get }
}

final class AppInstallationClock: AppInstallationDateProviding {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = AppInstallationClock()
    static let key = "meeshy.app.installationStartedAt.v1"

    private let defaults: UserDefaults
    private let now: () -> Date

    init(defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.now = now
    }

    var installationStartedAt: Date {
        if let stored = defaults.object(forKey: Self.key) as? Date { return stored }
        let started = now()
        defaults.set(started, forKey: Self.key)
        return started
    }
}
