import SwiftUI
import UIKit

// MARK: - Island Emerging Banner

/// Fait émerger une capsule de bannière depuis la Dynamic Island : la forme
/// naît en NOIR à la géométrie de l'île (invisible sur le hardware, l'île est
/// noire), puis descend et s'étend vers sa taille, sa couleur et sa position
/// finales juste SOUS l'île — le pattern système des Live Activities.
///
/// Le mouvement est porté par une `AnyTransition` custom symétrique :
/// - INSERTION : départ LENT (la capsule pointe hors de l'encoche), franche
///   accélération à mi-chemin, freinage doux pour se poser (retour user
///   2026-07-03 : « on doit voir comment ça sort de l'encoche »).
/// - RETRAIT : le miroir — la capsule se soulève, accélère et se refond dans
///   l'île (plus de fondu sur place au call-site).
/// Les courbes sont attachées à la transition elle-même : les toggles d'état
/// non enveloppés de `withAnimation` restent animés.
///
/// Placement : à utiliser dans un conteneur qui RESPECTE la safe area top ;
/// le mouvement remonte dans la zone de l'île via un offset négatif, en
/// lisant l'inset top réel de la fenêtre (les GeometryReader locaux lisent 0
/// une fois la safe area consommée).
///
/// Fallback (pas d'île — notch classique/SE — ou Reduce Motion) : capsule
/// statique à sa position finale, fondu simple à l'insertion/retrait (le
/// mouvement d'émergence peut déclencher une gêne vestibulaire).
struct IslandEmergingBanner<Content: View>: View {
    /// Couleur finale de la capsule (la naissance est toujours noire).
    let tint: Color
    let reduceMotion: Bool
    @ViewBuilder let content: () -> Content

    /// Géométrie publique de la Dynamic Island (capsule ~126×37 pt, top ~11 pt,
    /// centrée). Pas d'API système : constantes de facto, suffisantes car la
    /// naissance noir-sur-noir rend l'imprécision invisible.
    fileprivate static var islandWidth: CGFloat { 126 }
    fileprivate static var islandHeight: CGFloat { 37 }
    fileprivate static var islandTop: CGFloat { 11 }
    /// Padding final sous la safe area (aligné sur la bande de chrome top).
    fileprivate static var finalTopPadding: CGFloat { 8 }
    /// Demi-hauteur estimée de la capsule finale (padding v8×2 + footnote).
    /// ±4 pt d'imprécision sur le point de naissance restent noir-sur-noir.
    fileprivate static var estimatedFinalHalfHeight: CGFloat { 18 }

    /// Inset top réel de la fenêtre clé — l'île est présente à partir de 59 pt
    /// (iPhone 14 Pro → 16 Pro : 59–62 ; notch classique : 44–50).
    @MainActor
    private static var windowTopInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .safeAreaInsets.top ?? 0
    }

    var body: some View {
        let topInset = Self.windowTopInset
        let hasIsland = topInset >= 59

        if hasIsland && !reduceMotion {
            // Le style « posé » vit dans l'identity de la transition — appliqué
            // en régime permanent, et point d'arrivée/départ des animations.
            content()
                .transition(Self.emergenceTransition(tint: tint, topInset: topInset))
        } else {
            content()
                .modifier(IslandEmergenceStyle(born: false, tint: tint, topInset: topInset))
                .transition(.opacity)
        }
    }

    /// Émergence (insertion) et retour dans l'île (retrait), chacun avec sa
    /// courbe. Les Béziers custom : départ plat (lent) → accélération médiane
    /// → atterrissage doux ; le retrait est légèrement plus court, la capsule
    /// se dissout dans l'île sans traîner.
    fileprivate static func emergenceTransition(tint: Color, topInset: CGFloat) -> AnyTransition {
        let born = IslandEmergenceStyle(born: true, tint: tint, topInset: topInset)
        let settled = IslandEmergenceStyle(born: false, tint: tint, topInset: topInset)
        return .asymmetric(
            insertion: AnyTransition.modifier(active: born, identity: settled)
                .animation(.timingCurve(0.55, 0.0, 0.25, 1.0, duration: 0.7)),
            removal: AnyTransition.modifier(active: born, identity: settled)
                .animation(.timingCurve(0.5, 0.0, 0.35, 1.0, duration: 0.55))
        )
    }
}

/// Les deux états visuels de l'émergence — `born` (fondue dans l'île : noire,
/// géométrie de l'île, contenu invisible) et posé (capsule teintée à sa taille
/// naturelle sous l'île). SwiftUI interpole entre les deux le long de la
/// courbe de la transition.
private struct IslandEmergenceStyle: ViewModifier {
    let born: Bool
    let tint: Color
    let topInset: CGFloat

    func body(content: Content) -> some View {
        // Naissance : centre de la capsule posé sur le centre de l'île
        // (écran physique y = islandTop + islandHeight/2), exprimé en offset
        // depuis la position finale (topInset + finalTopPadding + h/2).
        let birthOffset = IslandEmergingBanner<EmptyView>.islandTop
            + IslandEmergingBanner<EmptyView>.islandHeight / 2
            - topInset
            - IslandEmergingBanner<EmptyView>.finalTopPadding
            - IslandEmergingBanner<EmptyView>.estimatedFinalHalfHeight

        content
            .opacity(born ? 0 : 1)
            .frame(
                width: born ? IslandEmergingBanner<EmptyView>.islandWidth : nil,
                height: born ? IslandEmergingBanner<EmptyView>.islandHeight : nil
            )
            .background(Capsule().fill(born ? Color.black : tint))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(born ? 0 : 0.15), radius: 6, y: 2)
            .offset(y: born ? birthOffset : 0)
            .padding(.top, IslandEmergingBanner<EmptyView>.finalTopPadding)
    }
}
