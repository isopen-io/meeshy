import SwiftUI
import MeeshySDK
import MeeshyUI

/// État de DÉPART des quatre pilotes d'apparition d'une story, dérivé de la
/// transition d'OUVERTURE choisie par l'auteur.
///
/// Pourquoi extraire ça d'un `switch` inline : la même story peut apparaître par
/// DEUX chemins — le cross-fade intra-groupe (`crossFadeStory`) et le retrait de
/// l'interlude d'identité inter-groupes (`dismissGroupIntro(revealing:)`). Le
/// second ne l'animait pas du tout avant le 2026-07-26 : passer d'un groupe à
/// l'autre posait le slide d'un bloc, alors qu'avancer dans un groupe respectait
/// le zoom / slide / reveal configuré. Une seule table de valeurs garantit
/// désormais qu'un zoom reste un zoom, qu'il arrive après un slide ou après le
/// voile d'identité.
///
/// « Armé » = ce qu'on pose HORS animation juste avant la transaction qui ramène
/// tout au repos (`contentOpacity` 1, `openingScale` 1, `textSlideOffset` 0,
/// `isRevealActive` vrai pour `.reveal` uniquement).
///
/// `nonisolated` porté par le TYPE et non méthode par méthode : `apps/ios`
/// compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, et l'annotation au
/// niveau des membres ne couvre ni la conformance `Equatable` synthétisée ni les
/// key paths — un helper purement calculatoire doit être neutre en entier.
nonisolated struct StoryOpeningEntrance: Equatable {
    /// Toujours 0 : quelle que soit la grammaire, la story entrante part
    /// invisible et c'est l'animation qui la fait exister.
    let contentOpacity: Double
    let openingScale: CGFloat
    /// Décalage HORIZONTAL en fraction de la largeur du canvas, aligné sur le
    /// SDK (`StoryRenderer.slideTransitionTravelFraction`). Distinct de
    /// `textSlideOffset`, qui est un décalage vertical en points.
    let openingSlideFraction: CGFloat
    let textSlideOffset: CGFloat
    let isRevealActive: Bool

    static func armed(for opening: StoryTransitionEffect?) -> StoryOpeningEntrance {
        switch opening {
        case .zoom:
            // `1.08 → 1.0` : le SDK DÉZOOME. Partir de 0.88 zoomait, donc le
            // même effet nommé jouait à l'envers selon qu'on regardait
            // l'aperçu du composer (chemin SDK) ou le lecteur.
            return StoryOpeningEntrance(contentOpacity: 0,
                                        openingScale: StoryRenderer.zoomTransitionScale,
                                        openingSlideFraction: 0,
                                        textSlideOffset: 0, isRevealActive: false)
        case .slide:
            // Le SDK glisse HORIZONTALEMENT de 8 % de la largeur du canvas ;
            // un décalage vertical de 30 pt ne correspondait ni à l'aperçu ni
            // à l'export.
            return StoryOpeningEntrance(contentOpacity: 0, openingScale: 1.0,
                                        openingSlideFraction: StoryRenderer.slideTransitionTravelFraction,
                                        textSlideOffset: 0, isRevealActive: false)
        case .reveal:
            // Rien à armer géométriquement : c'est `RevealCircleShape` qui joue,
            // piloté par `isRevealActive` qui bascule à vrai DANS l'animation.
            return StoryOpeningEntrance(contentOpacity: 0, openingScale: 1.0,
                                        openingSlideFraction: 0,
                                        textSlideOffset: 0, isRevealActive: false)
        case .fade, .none:
            // Fondu + micro-décalage (14 pt) : le fondu seul se lit comme un
            // saut de luminosité, le décalage lui donne une direction.
            return StoryOpeningEntrance(contentOpacity: 0, openingScale: 1.0,
                                        openingSlideFraction: 0,
                                        textSlideOffset: 14, isRevealActive: false)
        }
    }
}
