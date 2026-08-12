import Foundation

/// Règles pures du zoom viewport du canvas composer (pinch 3 doigts).
///
/// Deux problèmes résolus (C4, mission gesture-first) :
/// 1. `isCanvasZoomed` compare strictement `canvasScale != 1.0` — sans snap,
///    un pinch relâché à ~0,98 laissait le composer « zoomé » (TopBar cachée,
///    bouton reset affiché) alors que le canvas paraît à l'échelle 1.
/// 2. La sortie du zoom était bouton-only : le double-tap fond devient le
///    geste de reset, prioritaire sur le cycle videoFitMode existant qui
///    reste accessible à l'échelle 1.
public nonisolated enum CanvasViewportZoomPolicy {

    public static let minScale: CGFloat = 0.5
    public static let maxScale: CGFloat = 4.0

    /// Bande de snap autour de l'identité : sous ce delta, l'échelle relâchée
    /// est perceptuellement 1.0 — on la ramène à l'identité exacte pour que
    /// le chrome (TopBar, bouton reset) retrouve son état normal.
    public static let identitySnapTolerance: CGFloat = 0.08

    /// Échelle retenue au `.ended` du pinch viewport : clamp aux bornes puis
    /// snap à 1.0 si le résultat est dans la bande d'identité.
    public static func settledScale(current: CGFloat, gestureScale: CGFloat) -> CGFloat {
        let raw = min(maxScale, max(minScale, current * gestureScale))
        return abs(raw - 1.0) < identitySnapTolerance ? 1.0 : raw
    }

    /// Un double-tap fond réinitialise le viewport UNIQUEMENT quand le canvas
    /// est zoomé ET que le doigt ne touche aucun item foreground (un item
    /// garde son édition dédiée ; le cycle videoFitMode du fond média reste le
    /// comportement du double-tap à l'échelle 1).
    public static func doubleTapResetsViewport(isViewportZoomed: Bool, hitItemId: String?) -> Bool {
        isViewportZoomed && hitItemId == nil
    }
}
