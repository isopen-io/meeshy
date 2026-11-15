import UIKit

/// **Quel toucher le canvas garde-t-il ?** (#17432) — tout, par défaut ; posé sur le viseur,
/// seulement ce qui tombe sur un objet, ou le second doigt d'un geste déjà commencé sur l'un
/// d'eux. Le reste traverse vers la capture.
public nonisolated enum StoryCanvasTouchClaim {
    public static func claims(passesThroughEmpty: Bool, hitsItem: Bool, manipulating: Bool) -> Bool {
        !passesThroughEmpty || hitsItem || manipulating
    }

    /// Posé sur le viseur (`passesThroughEmptyTouches`), le canvas rend la main hors de ses objets.
    @MainActor
    static func claims(_ canvas: StoryCanvasUIView, at point: CGPoint) -> Bool {
        let traverse = canvas.passesThroughEmptyTouches
        return claims(passesThroughEmpty: traverse, hitsItem: traverse && canvas.hitTestItem(at: point) != nil,
                      manipulating: canvas.manipulatedItemId != nil)
    }
}
