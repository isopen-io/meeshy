import SwiftUI

public extension View {
    /// L'objet qu'on glisse, vu par l'hôte : au-dessus de la poubelle il se
    /// réduit à 0,57 et 75 % ; sur la duplication ou ailleurs, il ne change pas.
    /// Seules l'échelle et l'opacité s'animent ; sous « réduire les animations »,
    /// l'état se pose d'un coup.
    func meeshyDragged(over target: MeeshyDragTarget?) -> some View {
        modifier(MeeshyDraggedModifier(target: target))
    }
}

private struct MeeshyDraggedModifier: ViewModifier {
    let target: MeeshyDragTarget?

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    func body(content: Content) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        content
            .scaleEffect(MeeshyDragTargetsRecipe.draggedScale(over: target))
            .opacity(MeeshyDragTargetsRecipe.draggedOpacity(over: target))
            .animation(MeeshyDragTargetsRecipe.dragged(reduceMotion: reduce), value: target)
    }
}
