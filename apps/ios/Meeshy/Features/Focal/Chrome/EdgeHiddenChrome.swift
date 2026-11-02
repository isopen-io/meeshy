import SwiftUI

/// Escamotage d'un composant de chrome vers SON bord (directive user
/// 2026-08-21) : il glisse de `FocalMetrics.HiddenChrome.edgeTravel` vers le
/// bord (haut pour l'en-tête, bas pour le composeur et la bulle « retour en
/// bas ») en fondant, et revient du bord vers sa position en réapparaissant —
/// une seule animation, symétrique (`easeOut`), jamais un démontage : la
/// hauteur mesurée du composant ne bouge pas, aucun inset ne bouge.
struct EdgeHiddenChrome: ViewModifier {
    let isHidden: Bool
    let edge: VerticalEdge

    nonisolated static func offset(isHidden: Bool, edge: VerticalEdge) -> CGFloat {
        guard isHidden else { return 0 }
        return edge == .top ? -FocalMetrics.HiddenChrome.edgeTravel : FocalMetrics.HiddenChrome.edgeTravel
    }

    func body(content: Content) -> some View {
        content
            .offset(y: Self.offset(isHidden: isHidden, edge: edge))
            .opacity(isHidden ? FocalMetrics.HiddenChrome.opacityEnd : 1)
            .allowsHitTesting(!isHidden)
            .animation(.easeOut(duration: FocalMetrics.HiddenChrome.easeOut), value: isHidden)
    }
}

extension View {
    func hiddenTowardsEdge(_ isHidden: Bool, _ edge: VerticalEdge) -> some View {
        modifier(EdgeHiddenChrome(isHidden: isHidden, edge: edge))
    }
}
