import SwiftUI
import MeeshyUI

/// La teinte du PLATEAU — le fond permanent du composer unifié (O6).
///
/// Trois teintes, toutes sombres. Ce n'est pas une préférence esthétique
/// gratuite : le plateau encadre une scène que l'auteur compose, et un fond
/// sombre laisse la scène être la seule source de lumière de l'écran. Les trois
/// options changent l'ambiance sans jamais déplacer ce rapport.
///
/// **Chaque teinte est un jeton `MeeshyColors`, jamais un hex local.** Un
/// `Color.black` écrit ici échapperait au design system, et surtout aux mesures
/// de contraste qui garantissent que le socle reste lisible sur les trois
/// (`ComposerPlateauTests`).
///
/// Le `rawValue` est le format de persistance `@AppStorage` : le renommer
/// perdrait le réglage de tous ceux qui l'ont changé. Il est donc découplé du
/// nom de casse, qui, lui, peut évoluer.
nonisolated enum PlateauTint: String, CaseIterable, Equatable {
    case noir
    case indigoProfond
    case violetProfond

    /// Le fond que voit quiconque ouvre le composer pour la première fois.
    /// L'indigo profond plutôt que le noir : il porte la marque, là où le noir
    /// pur est une absence de choix.
    static let defaultTint: PlateauTint = .indigoProfond

    var color: Color {
        switch self {
        case .noir: return MeeshyColors.plateauNoir
        case .indigoProfond: return MeeshyColors.indigo950
        case .violetProfond: return MeeshyColors.violet950
        }
    }
}
