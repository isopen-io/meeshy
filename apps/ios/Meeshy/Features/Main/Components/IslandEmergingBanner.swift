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
/// Géométrie du morph (bug prod 2026-07-04 — « capsule géante ») : l'ancienne
/// implémentation interpolait `.frame(width: 126 → nil)`. Un frame `nil` rend
/// la dimension NON bornée pendant l'interpolation de la transition : sous un
/// parent qui propose l'écran entier (`.frame(maxWidth/maxHeight: .infinity)`),
/// la capsule de fond pouvait adopter la proposition et couvrir tout l'écran
/// (capture user IMG_0525). Le morph passe désormais par `scaleEffect` — un
/// effet de RENDU pur, `Animatable`, qui ne participe jamais au layout : la
/// capsule ne peut physiquement plus dépasser sa taille naturelle posée.
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
    /// Taille naturelle ESTIMÉE de la capsule posée (padding v8×2 + footnote ;
    /// largeur typique d'un libellé court + icône). Le ratio d'échelle à la
    /// naissance en dérive — ±20 % d'imprécision restent noir-sur-noir dans
    /// l'île, donc invisibles. Jamais utilisée pour du layout.
    fileprivate static var estimatedFinalSize: CGSize { CGSize(width: 240, height: 36) }
    fileprivate static var estimatedFinalHalfHeight: CGFloat { estimatedFinalSize.height / 2 }

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
                .modifier(IslandEmergenceStyle(progress: 1, tint: tint, topInset: topInset))
                .transition(.opacity)
        }
    }

    /// Émergence (insertion) et retour dans l'île (retrait), chacun avec sa
    /// courbe. Les Béziers custom : départ plat (lent) → accélération médiane
    /// → atterrissage doux ; le retrait est légèrement plus court, la capsule
    /// se dissout dans l'île sans traîner.
    fileprivate static func emergenceTransition(tint: Color, topInset: CGFloat) -> AnyTransition {
        let born = IslandEmergenceStyle(progress: 0, tint: tint, topInset: topInset)
        let settled = IslandEmergenceStyle(progress: 1, tint: tint, topInset: topInset)
        return .asymmetric(
            insertion: AnyTransition.modifier(active: born, identity: settled)
                .animation(.timingCurve(0.55, 0.0, 0.25, 1.0, duration: 0.7)),
            removal: AnyTransition.modifier(active: born, identity: settled)
                .animation(.timingCurve(0.5, 0.0, 0.35, 1.0, duration: 0.55))
        )
    }
}

/// Interpolation continue entre la naissance (`progress == 0` : fondue dans
/// l'île — noire, géométrie de l'île, contenu invisible) et l'état posé
/// (`progress == 1` : capsule teintée à sa taille naturelle sous l'île).
/// `Animatable` sur `progress` : SwiftUI interpole une SEULE valeur scalaire
/// le long de la courbe de la transition, et toute la géométrie en dérive de
/// façon déterministe (échelle de rendu, jamais de frame de layout).
private struct IslandEmergenceStyle: ViewModifier, Animatable {
    var progress: CGFloat
    let tint: Color
    let topInset: CGFloat

    // `body(content:)` est un @ViewBuilder : un `typealias` déclaré dedans ne
    // compile pas (« closure containing a declaration cannot be used with
    // result builder ») — il vit au niveau du type.
    private typealias Banner = IslandEmergingBanner<EmptyView>

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        // Naissance : centre de la capsule posé sur le centre de l'île
        // (écran physique y = islandTop + islandHeight/2), exprimé en offset
        // depuis la position finale (topInset + finalTopPadding + h/2).
        let birthOffset = Banner.islandTop
            + Banner.islandHeight / 2
            - topInset
            - Banner.finalTopPadding
            - Banner.estimatedFinalHalfHeight
        // Ratios île / taille naturelle estimée — bornés à 1 pour que la
        // capsule ne puisse JAMAIS rendre plus grand que sa taille posée.
        let birthScaleX = min(Banner.islandWidth / Banner.estimatedFinalSize.width, 1)
        let birthScaleY = min(Banner.islandHeight / Banner.estimatedFinalSize.height, 1)
        let p = min(max(progress, 0), 1)

        content
            .opacity(Double(p))
            .background(Capsule().fill(tint))
            // Voile noir : pleine opacité dans l'île (naissance noir-sur-noir),
            // fondu vers la teinte finale en se posant.
            .overlay(Capsule().fill(Color.black.opacity(Double(1 - p))))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(0.15 * Double(p)), radius: 6, y: 2)
            .scaleEffect(
                x: birthScaleX + (1 - birthScaleX) * p,
                y: birthScaleY + (1 - birthScaleY) * p
            )
            .offset(y: birthOffset * (1 - p))
            .padding(.top, Banner.finalTopPadding)
    }
}
