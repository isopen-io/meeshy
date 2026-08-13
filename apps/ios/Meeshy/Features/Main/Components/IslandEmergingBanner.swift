import SwiftUI
import UIKit

// MARK: - Island emergence progress (environment)

/// Avancement de l'émergence, exposé au CONTENU de la capsule : `0` = fondu
/// dans la Dynamic Island, `1` = posé sous elle.
///
/// Le contenu ne peut pas être re-construit par la transition (il est bâti
/// avant que le modifier ne s'applique) : l'environnement est le seul canal
/// qui laisse une sous-vue se colorer en fonction de sa position dans le
/// morph. C'est ce qui permet la règle produit « blanc sur noir UNIQUEMENT
/// dans l'îlot, couleurs de base une fois posé » sans dupliquer la vue.
///
/// Défaut `1` : une vue rendue hors d'un `IslandEmergingBanner` est, par
/// définition, posée.
private struct IslandEmergenceProgressKey: EnvironmentKey {
    static let defaultValue: CGFloat = 1
}

extension EnvironmentValues {
    var islandEmergenceProgress: CGFloat {
        get { self[IslandEmergenceProgressKey.self] }
        set { self[IslandEmergenceProgressKey.self] = newValue }
    }
}

// MARK: - Island Emerging Banner

/// Fait émerger une capsule de bannière depuis la Dynamic Island : la forme
/// naît EXACTEMENT à la géométrie de l'île (`IslandGeometry`), puis descend et
/// se contracte vers sa taille, sa couleur et sa position finales juste SOUS
/// l'île — le pattern système des Live Activities.
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
/// (capture user IMG_0525). Le morph passe par `scaleEffect` — un effet de
/// RENDU pur, `Animatable`, qui ne participe jamais au layout.
///
/// Exactitude du point de naissance (retour user 2026-08-13 — « ce n'est pas
/// envoyé exactement dedans mais toujours à côté ») : le correctif de 2026-07-04
/// avait BORNÉ les ratios d'échelle à `min(…, 1)`, garde-fou hérité du bug de
/// frame. Or l'île (126×37) est PLUS GRANDE qu'une pastille de jour (~103×30) :
/// la borne forçait donc la naissance à rester plus petite que l'île — la
/// capsule ne naissait jamais dedans, elle naissait à côté. `scaleEffect` étant
/// un effet de rendu borné par construction (il ne peut pas adopter une
/// proposition de layout), le ratio est désormais exact dans les deux sens, et
/// dérivé d'une taille posée FOURNIE par l'appelant (`settledSize`) plutôt que
/// d'une estimation figée : la naissance couvre l'île au pixel près.
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
    /// Taille naturelle de `content` une fois posé, calculée par l'appelant
    /// (métriques de police + padding connus). C'est d'elle que dérivent le
    /// ratio d'échelle et l'offset de naissance : une taille fausse déplace la
    /// naissance hors de l'île. Une taille nulle neutralise le morph d'échelle
    /// plutôt que de diviser par zéro.
    let settledSize: CGSize
    let reduceMotion: Bool
    @ViewBuilder let content: () -> Content

    /// Padding final sous la safe area, plancher aligné sur la bande de chrome
    /// top et garanti à au moins `IslandGeometry.clearanceBelow` sous l'île.
    fileprivate static var minimumTopPadding: CGFloat { 8 }

    /// Inset top réel de la fenêtre active — l'île est présente à partir de 59 pt
    /// (iPhone 14 Pro → 16 Pro : 59–62 ; notch classique : 44–50).
    ///
    /// `DeviceLayout.safeAreaTop` filtre sur `activationState` : l'ancien
    /// `flatMap(\.windows).first(where: \.isKeyWindow)` aplatissait TOUTES les
    /// scènes, arrière-plan compris, et pouvait donc trancher « île / pas d'île »
    /// sur une autre fenêtre que celle qu'on regarde.
    @MainActor
    private static var windowTopInset: CGFloat { DeviceLayout.safeAreaTop }

    var body: some View {
        let topInset = Self.windowTopInset

        if IslandGeometry.isPresent(safeAreaTop: topInset) && !reduceMotion {
            // Le style « posé » vit dans l'identity de la transition — appliqué
            // en régime permanent, et point d'arrivée/départ des animations.
            content()
                .transition(Self.emergenceTransition(
                    tint: tint, settledSize: settledSize, topInset: topInset
                ))
        } else {
            content()
                .modifier(IslandEmergenceStyle(
                    progress: 1, tint: tint, settledSize: settledSize, topInset: topInset
                ))
                .transition(.opacity)
        }
    }

    /// Émergence (insertion) et retour dans l'île (retrait), chacun avec sa
    /// courbe. Les Béziers custom : départ plat (lent) → accélération médiane
    /// → atterrissage doux ; le retrait est légèrement plus court, la capsule
    /// se dissout dans l'île sans traîner.
    fileprivate static func emergenceTransition(
        tint: Color, settledSize: CGSize, topInset: CGFloat
    ) -> AnyTransition {
        let born = IslandEmergenceStyle(
            progress: 0, tint: tint, settledSize: settledSize, topInset: topInset
        )
        let settled = IslandEmergenceStyle(
            progress: 1, tint: tint, settledSize: settledSize, topInset: topInset
        )
        return .asymmetric(
            insertion: AnyTransition.modifier(active: born, identity: settled)
                .animation(.timingCurve(0.55, 0.0, 0.25, 1.0, duration: 0.7)),
            removal: AnyTransition.modifier(active: born, identity: settled)
                .animation(.timingCurve(0.5, 0.0, 0.35, 1.0, duration: 0.55))
        )
    }
}

// MARK: - Geometry (pure, testable)

/// Dérivations pures du morph — extraites du `ViewModifier` pour être
/// vérifiables sans rendu. Toutes les valeurs sont exprimées dans le repère de
/// l'écran, en points.
enum IslandEmergenceGeometry {
    /// Ordonnée du centre de la capsule une fois posée.
    static func settledCenterY(
        safeAreaTop: CGFloat, settledHeight: CGFloat, minimumTopPadding: CGFloat
    ) -> CGFloat {
        let padding = IslandGeometry.settledTopPadding(
            safeAreaTop: safeAreaTop, minimum: minimumTopPadding
        )
        return safeAreaTop + padding + settledHeight / 2
    }

    /// Décalage vertical à appliquer à la capsule posée pour que son centre
    /// coïncide avec celui de l'île. Négatif : la capsule remonte.
    static func birthOffset(
        safeAreaTop: CGFloat, settledHeight: CGFloat, minimumTopPadding: CGFloat
    ) -> CGFloat {
        IslandGeometry.centerY(safeAreaTop: safeAreaTop)
            - settledCenterY(
                safeAreaTop: safeAreaTop,
                settledHeight: settledHeight,
                minimumTopPadding: minimumTopPadding
            )
    }

    /// Ratios d'échelle qui font rendre la capsule posée EXACTEMENT à la
    /// taille de l'île. Jamais bornés à 1 : l'île est plus large et plus haute
    /// qu'une pastille de jour, la naissance doit donc pouvoir grandir.
    /// Une dimension posée nulle (contenu pas encore mesurable) neutralise le
    /// morph sur cet axe plutôt que de produire un infini.
    static func birthScale(settledSize: CGSize) -> CGSize {
        CGSize(
            width: settledSize.width > 0 ? IslandGeometry.width / settledSize.width : 1,
            height: settledSize.height > 0 ? IslandGeometry.height / settledSize.height : 1
        )
    }
}

// MARK: - Style

/// Interpolation continue entre la naissance (`progress == 0` : à la géométrie
/// de l'île, capsule noire, contenu lisible en blanc dessus) et l'état posé
/// (`progress == 1` : capsule teintée à sa taille naturelle sous l'île).
/// `Animatable` sur `progress` : SwiftUI interpole une SEULE valeur scalaire
/// le long de la courbe de la transition, et toute la géométrie en dérive de
/// façon déterministe (échelle de rendu, jamais de frame de layout).
private struct IslandEmergenceStyle: ViewModifier, Animatable {
    var progress: CGFloat
    let tint: Color
    let settledSize: CGSize
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
        let p = min(max(progress, 0), 1)
        let birthOffset = IslandEmergenceGeometry.birthOffset(
            safeAreaTop: topInset,
            settledHeight: settledSize.height,
            minimumTopPadding: Banner.minimumTopPadding
        )
        let birthScale = IslandEmergenceGeometry.birthScale(settledSize: settledSize)

        content
            // Le contenu se colore d'après sa position dans le morph : blanc
            // tant qu'il est dans l'île, couleurs de base une fois posé.
            .environment(\.islandEmergenceProgress, p)
            // Voile noir DERRIÈRE le contenu (et devant la teinte) : dans
            // l'île la capsule est noire et le texte reste lisible dessus —
            // c'était un overlay AU-DESSUS du contenu jusqu'ici, qui masquait
            // l'information au lieu de lui servir de fond.
            .background(Capsule().fill(Color.black.opacity(Double(1 - p))))
            .background(Capsule().fill(tint))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(0.15 * Double(p)), radius: 6, y: 2)
            .scaleEffect(
                x: birthScale.width + (1 - birthScale.width) * p,
                y: birthScale.height + (1 - birthScale.height) * p
            )
            .offset(y: birthOffset * (1 - p))
            .padding(.top, IslandGeometry.settledTopPadding(
                safeAreaTop: topInset, minimum: Banner.minimumTopPadding
            ))
    }
}
