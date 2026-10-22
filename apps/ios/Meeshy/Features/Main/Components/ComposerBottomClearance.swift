import SwiftUI
import MeeshyUI

/// **La barre de composition laisse toujours au moins un bouton d'espace sous
/// elle, clavier fermé** (#11565, directive porteur 2026-10-22).
///
/// L'air exigé sous la barre vaut `max(encart bas, diamètre d'une porte)` —
/// jamais leur somme, sinon la barre monterait trop haut sur un Pro Max. Chaque
/// hôte pose la barre à sa façon (dock qui ignore la zone sûre, feuille qui la
/// respecte, lecteur de story qui la soulève lui-même) : la règle part donc de
/// l'air que l'hôte laisse DÉJÀ sous la barre et ne rend que le complément.
/// Un clavier ou un panneau qui prend sa place (carrousel, emojis) garde
/// l'espacement d'aujourd'hui : le relèvement vaut alors zéro.
nonisolated enum ComposerBottomClearance {

    /// Le diamètre d'une porte de la barre d'outils, celle du sticker comprise.
    static let doorDiameter: CGFloat = 44

    /// L'air exigé entre le bas de la barre et le bas de l'écran.
    static func required(safeAreaBottom: CGFloat, doorDiameter: CGFloat = doorDiameter) -> CGFloat {
        max(safeAreaBottom, doorDiameter)
    }

    /// Le relèvement que la barre ajoute sous elle.
    ///
    /// - `spaceBelow` : l'air que l'hôte laisse sous la barre sans relèvement
    ///   (`nil` tant qu'il n'est pas mesuré : rien ne bouge).
    /// - `inputSurfaceShown` : clavier, carrousel ou panneau ouvert sous la barre.
    static func lift(spaceBelow: CGFloat?,
                     safeAreaBottom: CGFloat,
                     inputSurfaceShown: Bool,
                     doorDiameter: CGFloat = doorDiameter) -> CGFloat {
        guard !inputSurfaceShown, let spaceBelow else { return 0 }
        let needed = required(safeAreaBottom: safeAreaBottom, doorDiameter: doorDiameter)
        return min(max(needed - max(spaceBelow, 0), 0), needed)
    }
}

/// Applique `ComposerBottomClearance` à la barre : mesure l'air que l'hôte
/// laisse sous elle au repos, et pose le complément en marge basse.
///
/// La mesure se prend sur le cadre qui INCLUT le relèvement : la barre étant
/// ancrée en bas chez tous ses hôtes, ce bord ne bouge pas quand le relèvement
/// change, et la mesure ne se nourrit pas d'elle-même. Elle se fige pendant
/// que le clavier ou un panneau est ouvert, pour que la barre retrouve sa place
/// dans le même mouvement que le clavier qui descend.
struct ComposerBottomClearanceModifier: ViewModifier {
    let ownBottomPadding: CGFloat
    let safeAreaBottom: CGFloat
    let windowHeight: CGFloat
    let inputSurfaceShown: Bool

    @State private var spaceBelow: CGFloat?

    private var lift: CGFloat {
        ComposerBottomClearance.lift(spaceBelow: spaceBelow,
                                     safeAreaBottom: safeAreaBottom,
                                     inputSurfaceShown: inputSurfaceShown)
    }

    func body(content: Content) -> some View {
        content
            .padding(.bottom, lift)
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { maxY in
                record(maxY: maxY)
            }
    }

    private func record(maxY: CGFloat) {
        guard !inputSurfaceShown else { return }
        let measured = (windowHeight - maxY + ownBottomPadding).rounded()
        guard spaceBelow.map({ abs($0 - measured) >= 1 }) ?? true else { return }
        if spaceBelow == nil {
            spaceBelow = measured
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { spaceBelow = measured }
        }
    }
}
