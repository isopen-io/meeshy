import SwiftUI
import MeeshySDK

/// Respiration autour de la rangée MAGNIFIÉE (directive user 2026-08-22 :
/// « le triple de l'espace actuel entre la rangée de magnificence et les
/// autres rangées ») : pendant la scène, les rangées voisines s'écartent de
/// la ligne de focus — celles du dessus montent, celles du dessous
/// descendent — d'au plus `LentilleMetrics.FocusCard.breathing` points.
///
/// Translation de compositor SEULE (`visualEffect`, zéro relayout, R2) : la
/// rangée élue ne bouge pas (rampe nulle sous `breathingRampStart`), la carte
/// qui la suit non plus ; l'écart croît sur `breathingRampLength` pour qu'une
/// rangée qui traverse la ligne ne saute jamais. Vit dans `Lentille/Mode/`
/// (pas dans `Lentille/Perspective/`, gelé « opacité et échelle seules »).
struct LentilleFocusBreathing: ViewModifier {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject private var scene: LentilleSceneActivity

    /// Déplacement vertical (points) d'une rangée à `distance` de la ligne
    /// de focus — `centerY − rowMidY`, positif AU-DESSUS de la ligne, donc
    /// poussée vers le haut (négative) ; négatif en dessous, poussée vers
    /// le bas.
    nonisolated static func push(distance: CGFloat, level: CGFloat, reduceMotion: Bool) -> CGFloat {
        guard !reduceMotion, level > 0, distance != 0 else { return 0 }
        let ramp = min(1, max(0, (abs(distance) - LentilleMetrics.FocusCard.breathingRampStart) / LentilleMetrics.FocusCard.breathingRampLength))
        let direction: CGFloat = distance > 0 ? -1 : 1
        return direction * LentilleMetrics.FocusCard.breathing * ramp * level
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.visualEffect { [reduceMotion, level = scene.level, scene] effect, proxy in
                // Même repère que `LentillePerspective` : région visible
                // convertie dans le repère du rang, milieu = demi-hauteur.
                let distance = proxy.bounds(of: .scrollView(axis: .vertical)).map { viewport in
                    LentillePerspective.distance(
                        rowMidY: proxy.size.height / 2,
                        viewportTop: viewport.minY,
                        viewportBottom: viewport.maxY,
                        offsetFromTop: scene.offset
                    )
                } ?? 0
                return effect.offset(y: Self.push(distance: distance, level: level, reduceMotion: reduceMotion))
            }
        } else {
            content
        }
    }
}

extension View {

    /// Sous OFF, rien n'est monté (même discipline que `lentillePerspective`).
    @ViewBuilder
    func lentilleFocusBreathing(isEnabled: Bool) -> some View {
        if isEnabled {
            modifier(LentilleFocusBreathing())
        } else {
            self
        }
    }
}
