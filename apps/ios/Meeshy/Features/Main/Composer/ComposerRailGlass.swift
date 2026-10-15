import SwiftUI
import MeeshyUI

/// **Le verre d'un rail : une carte-colonne, ou des boutons SÉPARÉS**
/// (directive porteur 2026-09-27 : « que de faire une bande à gauche et à
/// droite, fais des boutons séparés sans caption »).
///
/// Sur la scène plein écran, aucune colonne ne se dessine et aucune entrée ne
/// porte plus de disque de verre (#10358, #10364) : glyphes blancs en relief
/// (`ComposerFloatingRailInk`) ; ailleurs (rangée basse), la carte-colonne
/// d'avant reste.
struct ComposerRailCard: ViewModifier {
    let separate: Bool
    let plateauTint: Color

    func body(content: Content) -> some View {
        if separate {
            content
        } else {
            content.adaptiveLiquidGlass(in: RoundedRectangle(cornerRadius: ComposerRailGeometry.railWidth / 2,
                                                       style: .continuous),
                                  tint: plateauTint.opacity(0.55))
        }
    }
}

/// **L'encre d'un glyphe du rail gauche posé sur la scène** (#10358, retour de
/// recette porteur 2026-10-12 : « enlever l'effet bulle glass autour des tools
/// de la rail gauche et avoir les boutons en blanc avec ombre sur relief »).
///
/// Sans disque de verre, le glyphe se lit sur n'importe quel fond par son
/// encre BLANCHE et l'ombre portée qui le détache ; l'état actif (outil
/// ouvert, bascule de scène allumée) passe au JAUNE, comme la colonne de
/// regards de la capture (`ComposerLookRail`). En colonne (rangée basse,
/// éditeur), la teinte donnée par l'appelant ne change pas.
nonisolated enum ComposerFloatingRailInk {
    static let rest: Color = .white
    static let active: Color = .yellow
    static let shadowOpacity: Double = 0.45
    static let shadowRadius: CGFloat = 3
    static let shadowY: CGFloat = 1

    static func glyph(separate: Bool, active isActive: Bool, columnTint: Color) -> Color {
        guard separate else { return columnTint }
        return floating(active: isActive, restTint: rest)
    }

    /// **Tout bouton d'outil posé sur la scène** (#10364, retour porteur
    /// 2026-10-12 : « enlever les cercles autour des outils ») — rail droit,
    /// couloir de l'éditeur d'objet, rangée d'outils du document : jaune
    /// quand il est actif, sinon sa teinte de repos — le blanc, sauf l'action
    /// destructrice qui garde la couleur sémantique d'erreur.
    static func floating(active isActive: Bool, restTint: Color = rest) -> Color {
        isActive ? active : restTint
    }
}

/// L'ombre portée qui met en relief un glyphe — ou une pastille — du rail
/// posé sur la scène. Rien en colonne : la rangée basse garde son dessin.
struct ComposerRailGlyphRelief: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        if active {
            content.shadow(color: .black.opacity(ComposerFloatingRailInk.shadowOpacity),
                           radius: ComposerFloatingRailInk.shadowRadius,
                           y: ComposerFloatingRailInk.shadowY)
        } else {
            content
        }
    }
}
