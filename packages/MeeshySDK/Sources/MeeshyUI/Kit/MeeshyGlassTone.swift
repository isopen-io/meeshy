import Foundation

/// Le ton d'un verre : ce qui se lit à travers lui, pas le thème de l'app.
///
/// `plain`, `deep` et `onLight` sont les trois tons de la planche, élus par la
/// luminance du contenu dessous. `theme` est le verre actuel des listes et des
/// en-têtes : hors média, à l'encre du thème, que la planche ne dessine pas.
public nonisolated enum MeeshyGlassTone: String, Sendable, Equatable, CaseIterable {
    case plain
    case deep
    case onLight
    case theme

    /// Sous cette luminance, le contenu est assez sombre pour un verre clair.
    public static let plainCeiling: Double = 0.118
    /// Au-delà, le contenu est clair : le verre se fonce.
    public static let deepCeiling: Double = 0.613
    /// La marge dans laquelle le ton précédent est tenu.
    public static let hysteresis: Double = 0.03

    /// La loi du ton. Luminance inconnue ⇒ `deep`. Avec un ton précédent, la
    /// bascule n'a lieu qu'une fois sortie de l'hystérésis de sa bande.
    public static func resolve(luminance: Double?, previous: MeeshyGlassTone? = nil) -> MeeshyGlassTone {
        guard let luminance else { return .deep }
        if let previous, previous.holds(luminance: luminance) { return previous }
        return band(of: luminance)
    }

    private static func band(of luminance: Double) -> MeeshyGlassTone {
        if luminance < plainCeiling { return .plain }
        if luminance < deepCeiling { return .deep }
        return .onLight
    }

    private func holds(luminance: Double) -> Bool {
        switch self {
        case .plain: return luminance < Self.plainCeiling + Self.hysteresis
        case .deep: return luminance >= Self.plainCeiling - Self.hysteresis && luminance < Self.deepCeiling + Self.hysteresis
        case .onLight: return luminance >= Self.deepCeiling - Self.hysteresis
        case .theme: return false
        }
    }
}

/// La densité d'un verre : `dense` porte du texte.
public nonisolated enum MeeshyGlassDensity: String, Sendable, Equatable, CaseIterable {
    case regular
    case dense
}
