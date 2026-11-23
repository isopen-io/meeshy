import Foundation

/// Les blocs de ma Vitrine qui RENSEIGNENT sans se modifier sur place (#20177) : en édition, la Vitrine ne montre que ce
/// qui s'y modifie — identité, accent, décor, contact, langues, voix — et ces blocs se taisent. Ils reviennent à
/// « Enregistrer » comme à « Annuler ».
nonisolated enum ProfileVitrineBlock: CaseIterable, Sendable {
    /// Mes cercles : ils se règlent dans « Mes cercles ».
    case circles
    /// Mes adresses : elles se règlent dans « Mes adresses ».
    case addresses
    /// Mon activité : des chiffres, rien à modifier.
    case activity
    /// Ma Légende : le jeu, rien à modifier.
    case legend

    static func isShown(_ block: ProfileVitrineBlock, isEditing: Bool) -> Bool {
        !isEditing
    }
}
