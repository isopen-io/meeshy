import Foundation
import MeeshySDK

/// Où se garde la table des cercles servie (`GET /relations/config`) : relue au lancement pour nommer les niveaux avant
/// tout réseau (cache d'abord), réécrite à chaque table servie. Lu et écrit par les ViewModels, sur l'acteur principal.
protocol RelationsConfigCaching: AnyObject {
    func cached() -> RelationsConfig?
    func save(_ config: RelationsConfig)
}

/// Le cache de production : la table en JSON dans les préférences de l'appareil. Une entrée illisible vaut « rien
/// gardé », jamais une erreur.
final class RelationsConfigDefaultsCache: RelationsConfigCaching {
    static let shared = RelationsConfigDefaultsCache()
    static let key = "relations:config"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func cached() -> RelationsConfig? {
        defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(RelationsConfig.self, from: $0) }
    }

    func save(_ config: RelationsConfig) {
        guard let data = try? JSONEncoder().encode(config) else { return }
        defaults.set(data, forKey: Self.key)
    }
}

/// Le cache des témoins et des écrans sans câblage : il vit le temps de son propriétaire.
final class RelationsConfigMemoryCache: RelationsConfigCaching {
    private var stored: RelationsConfig?

    func cached() -> RelationsConfig? { stored }

    func save(_ config: RelationsConfig) { stored = config }
}

/// Comment se nomme un niveau : le libellé servi dans la langue de l'interface, sinon le nom du catalogue local. Un
/// libellé vide ou une langue absente retombent sur le catalogue ; un niveau ne s'affiche jamais par sa clé.
nonisolated struct CircleLevelTitles: Equatable, Sendable {
    let config: RelationsConfig?
    let language: String

    static let catalogue = CircleLevelTitles(config: nil, language: "")

    func title(of level: RelationLevel) -> String {
        guard let served = config?.label(for: level, language: language), !served.isEmpty else {
            return CircleLevelNames.title(of: level)
        }
        return served
    }

    func icon(of level: RelationLevel) -> String {
        guard let served = config?.icon(for: level), !served.isEmpty else { return CircleLevelNames.icon(of: level) }
        return served
    }
}
