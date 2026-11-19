import SwiftUI

private struct ProfileAccentKey: EnvironmentKey {
    static let defaultValue: String? = nil
}

public extension EnvironmentValues {
    /// L'accent de la fiche ouverte (hex), pour le contenu que l'app y injecte — les publications d'un autre prennent
    /// la couleur de la personne, jamais un indigo codé en dur ; `nil` hors d'une fiche.
    var meeshyProfileAccent: String? {
        get { self[ProfileAccentKey.self] }
        set { self[ProfileAccentKey.self] = newValue }
    }
}

private struct ProfileNetworkIsOfflineKey: EnvironmentKey {
    static let defaultValue: Bool? = nil
}

public extension EnvironmentValues {
    /// La connectivité que l'app observe (son moniteur réseau), remise telle quelle : `true` sans réseau. `nil` quand
    /// l'app n'en remet aucune — la fiche déduit alors l'absence de réseau de son dernier chargement.
    var profileNetworkIsOffline: Bool? {
        get { self[ProfileNetworkIsOfflineKey.self] }
        set { self[ProfileNetworkIsOfflineKey.self] = newValue }
    }
}
