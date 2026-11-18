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
