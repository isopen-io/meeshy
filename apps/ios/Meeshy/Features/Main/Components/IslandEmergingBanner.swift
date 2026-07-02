import SwiftUI
import UIKit

// MARK: - Island Emerging Banner

/// Fait émerger une capsule de bannière depuis la Dynamic Island : la forme
/// naît en NOIR à la géométrie de l'île (invisible sur le hardware, l'île est
/// noire), puis descend et s'étend en spring vers sa taille, sa couleur et sa
/// position finales juste SOUS l'île — le pattern système des Live Activities.
///
/// Placement : à utiliser dans un conteneur qui RESPECTE la safe area top ;
/// le composant remonte lui-même dans la zone de l'île via un offset négatif
/// pendant la phase de naissance, en lisant l'inset top réel de la fenêtre
/// (les GeometryReader locaux lisent 0 une fois la safe area consommée).
///
/// Fallback (pas d'île — notch classique/SE — ou Reduce Motion) : la bannière
/// se rend directement à sa position finale ; l'apparition est portée par la
/// `.transition` du call-site.
struct IslandEmergingBanner<Content: View>: View {
    /// Couleur finale de la capsule (la naissance est toujours noire).
    let tint: Color
    let reduceMotion: Bool
    @ViewBuilder let content: () -> Content

    @State private var emerged = false

    /// Géométrie publique de la Dynamic Island (capsule ~126×37 pt, top ~11 pt,
    /// centrée). Pas d'API système : constantes de facto, suffisantes car la
    /// naissance noir-sur-noir rend l'imprécision invisible.
    private static var islandWidth: CGFloat { 126 }
    private static var islandHeight: CGFloat { 37 }
    private static var islandTop: CGFloat { 11 }
    /// Padding final sous la safe area (aligné sur la bande de chrome top).
    private static var finalTopPadding: CGFloat { 8 }
    /// Demi-hauteur estimée de la capsule finale (padding v8×2 + footnote).
    /// ±4 pt d'imprécision sur le point de naissance restent noir-sur-noir.
    private static var estimatedFinalHalfHeight: CGFloat { 18 }

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
        let animates = hasIsland && !reduceMotion
        let settled = emerged || !animates
        // Naissance : centre de la capsule posé sur le centre de l'île
        // (écran physique y = islandTop + islandHeight/2), exprimé en offset
        // depuis la position finale (topInset + finalTopPadding + h/2).
        let birthOffset = Self.islandTop + Self.islandHeight / 2
            - topInset - Self.finalTopPadding - Self.estimatedFinalHalfHeight

        content()
            .opacity(settled ? 1 : 0)
            .frame(
                width: settled ? nil : Self.islandWidth,
                height: settled ? nil : Self.islandHeight
            )
            .background(Capsule().fill(settled ? tint : Color.black))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(settled ? 0.15 : 0), radius: 6, y: 2)
            .offset(y: settled ? 0 : birthOffset)
            .padding(.top, Self.finalTopPadding)
            .onAppear {
                guard animates, !emerged else { return }
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    emerged = true
                }
            }
    }
}
