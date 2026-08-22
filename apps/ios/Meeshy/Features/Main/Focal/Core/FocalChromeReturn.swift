import CoreGraphics

/// Chrome du fil (boutons d'en-tête, composeur, bulle « retour en bas »,
/// pilule de jour) pendant le défilement — directive user 2026-08-21 :
/// « faire apparaître les contrôleurs uniquement quand on s'approche de la
/// fin du scroll, et non juste quand on relâche ».
///
/// Le doigt posé cache ; une décélération cache tant que la distance restante
/// jusqu'à l'offset d'arrivée (`scrollViewWillEndDragging(withVelocity:
/// targetContentOffset:)`) dépasse `returnDistance` ; au repos, tout revient.
nonisolated enum FocalChromeReturn {

    /// Distance restante (points) en deçà de laquelle le chrome revient
    /// pendant la décélération — « on s'approche de la fin ».
    static let returnDistance: CGFloat = 160

    static func isHidden(isTracking: Bool, isDecelerating: Bool, remainingDistance: CGFloat?) -> Bool {
        if isTracking { return true }
        guard isDecelerating, let remainingDistance else { return false }
        return abs(remainingDistance) > returnDistance
    }
}
