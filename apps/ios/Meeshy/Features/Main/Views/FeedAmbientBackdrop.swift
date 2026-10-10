import SwiftUI
import MeeshyUI

/// Fond du fil : dégradé du thème + orbes ambiants, RASTERISÉS en une seule
/// texture (#9702).
///
/// Les orbes sont de grands cercles floutés (`blur(radius: size / 3)`) posés
/// SOUS une liste qui défile : sans `.drawingGroup()`, chaque frame de
/// défilement recomposait plusieurs passes de flou hors écran. Rasterisé, le
/// fond est une texture Metal que le compositeur réutilise telle quelle — même
/// motif que `RootThemedBackground` (`RootLayers/RootSharedLayers.swift`).
///
/// Lit `ThemeManager.shared` sans l'observer, exactement comme `FeedView` le
/// faisait : le fond suit le thème au rendu suivant, il ne s'abonne à rien.
struct FeedAmbientBackdrop: View {
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            theme.backgroundGradient

            ForEach(0..<theme.ambientOrbs.count, id: \.self) { i in
                let orb = theme.ambientOrbs[i]
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size / 3)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }
        }
        .drawingGroup()
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
