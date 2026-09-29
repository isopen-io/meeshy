import SwiftUI
import MeeshyUI

/// **Le verre d'un rail : une carte-colonne, ou des boutons SÉPARÉS**
/// (directive porteur 2026-09-27 : « que de faire une bande à gauche et à
/// droite, fais des boutons séparés sans caption »).
///
/// Sur la scène plein écran, chaque entrée porte son propre disque de verre
/// teinté du plateau et aucune colonne ne se dessine ; ailleurs (éditeur
/// d'objet, rangée basse), la carte-colonne d'avant reste.
struct ComposerRailCard: ViewModifier {
    let separate: Bool
    let plateauTint: Color

    func body(content: Content) -> some View {
        if separate {
            content
        } else {
            content.adaptiveGlass(in: RoundedRectangle(cornerRadius: ComposerRailGeometry.railWidth / 2,
                                                       style: .continuous),
                                  tint: plateauTint.opacity(0.55))
        }
    }
}

/// Le disque de verre d'une entrée, quand le rail est en boutons séparés.
///
/// **Le disque est plus petit que la cible** (directive porteur 2026-09-28) :
/// il se dessine sur `floatingButtonSize`, et l'appelant rend ensuite le cadre
/// de `railWidth` — le doigt garde ses 44 pt, l'œil voit un bouton plus léger.
struct ComposerRailButtonGlass: ViewModifier {
    let active: Bool
    let plateauTint: Color
    var tint: Color? = nil

    func body(content: Content) -> some View {
        if active {
            content
                .frame(width: ComposerRailGeometry.floatingButtonSize,
                       height: ComposerRailGeometry.floatingButtonSize)
                .adaptiveGlass(in: Circle(), tint: tint ?? plateauTint.opacity(0.55))
        } else {
            content
        }
    }
}
