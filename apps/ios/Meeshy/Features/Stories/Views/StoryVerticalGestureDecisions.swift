import CoreGraphics
import Foundation

/// Action verticale résolue au relâchement d'un drag vertical.
enum StoryVerticalGestureAction: Equatable {
    /// Sous le seuil : la vue revient à sa position initiale.
    case cancel
    /// Swipe haut en mode fenêtré → passe en plein écran.
    case enterFullscreen
    /// Swipe bas en plein écran → revient en mode fenêtré (ne quitte PAS).
    case exitFullscreen
    /// Swipe bas en mode fenêtré → quitte la story.
    case dismissViewer
    /// Rien à faire (swipe haut alors qu'on est déjà en plein écran).
    case none
    /// Une surface du lecteur est ouverte : le geste lui revient. Elle se
    /// referme, et RIEN d'autre ne se produit — parité avec la garde du
    /// toucher (`StoryReaderCanvas`, touch-down sur `hasActiveFeature`).
    case dismissActiveFeature
}

/// Décide du sort d'un drag vertical selon l'état plein écran.
///
/// Le swipe bas porte DEUX sens selon le contexte ; la règle « sortir du plein
/// écran » prime sur « quitter la story » (spec 2026-07-25), sinon il serait
/// impossible de revenir en mode fenêtré au doigt.
enum StoryVerticalGestureDecisions {

    /// - Parameters:
    ///   - translationY: translation verticale courante (positif = vers le bas).
    ///   - predictedY: translation projetée par l'inertie — permet de valider
    ///     un flick court mais rapide.
    ///   - isFullscreen: état plein écran au moment du relâchement.
    ///   - threshold: distance de validation en points.
    ///   - hasActiveFeature: une surface du lecteur est ouverte (strip de
    ///     langues, barre d'emojis, overlay de commentaires, transcription).
    ///     Elle CONSOMME alors tout geste vertical franchissant le seuil, dans
    ///     les deux sens : sans cette garde, un swipe bas fermait le lecteur et
    ///     l'utilisateur perdait la story EN PLUS de son overlay, alors qu'il
    ///     voulait seulement refermer ce dernier. Parité avec la garde du
    ///     toucher, où le premier contact referme la surface et rien d'autre.
    static func decide(translationY: CGFloat,
                       predictedY: CGFloat,
                       isFullscreen: Bool,
                       threshold: CGFloat,
                       hasActiveFeature: Bool = false) -> StoryVerticalGestureAction {
        let predictionThreshold = threshold * 2.5

        let goesDown = translationY > threshold || predictedY > predictionThreshold
        let goesUp = translationY < -threshold || predictedY < -predictionThreshold

        // Sous le seuil, on ne referme rien : un micro-mouvement ne doit pas
        // escamoter une surface que l'utilisateur est peut-être en train de lire.
        if hasActiveFeature { return (goesDown || goesUp) ? .dismissActiveFeature : .cancel }

        if goesDown { return isFullscreen ? .exitFullscreen : .dismissViewer }
        if goesUp { return isFullscreen ? .none : .enterFullscreen }
        return .cancel
    }
}
