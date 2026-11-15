import SwiftUI

/// **L'entrée et le retrait d'une pièce du cadre** : l'en-tête entre par le haut, la plaque par le bas
/// (translation de 12 et opacité, 250 ms ; sortie 200 ms). Rangée, la pièce est RETIRÉE de l'arbre : ni
/// visible, ni touchable, ni lue — et sous iOS 26 aucun verre n'y reste dessiné. « Réduire les
/// animations » : un fondu de 150 ms, sans déplacement.
///
/// Seules la translation et l'opacité s'animent ; jamais le flou, ni la hauteur.
struct MeeshyModePresence<Content: View>: View {
    let presence: MeeshyModeChromePresence
    let edge: VerticalEdge
    @ViewBuilder let content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    var body: some View {
        let motion = MeeshyModeChromeRecipe.motion(
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        )
        return Group {
            if !presence.isStowed {
                content()
                    .transition(Self.transition(edge: edge, motion: motion))
            }
        }
        .animation(.easeInOut(duration: motion.duration(toward: presence)), value: presence)
    }

    static func transition(edge: VerticalEdge, motion: MeeshyModeChromeMotion) -> AnyTransition {
        guard !motion.isFadeOnly else { return .opacity }
        let direction: CGFloat = edge == .top ? -1 : 1
        return AnyTransition.offset(y: direction * motion.travel).combined(with: .opacity)
    }
}
