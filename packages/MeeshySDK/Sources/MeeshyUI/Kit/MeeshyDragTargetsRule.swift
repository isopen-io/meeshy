import SwiftUI

/// La loi PURE des cibles : où se posent les disques, et quelle cible le doigt
/// survole. Elle ne connaît que des rectangles, un point et des rayons.
public nonisolated enum MeeshyDragTargetsRule {

    /// Où se posent les centres des disques, dans l'espace de la vue.
    ///
    /// - la duplication s'aligne sur le bord haut de `topSlot` et son milieu
    ///   horizontal ; sans emplacement, à `MeeshySpacing.lg` du bord sûr haut ;
    /// - la poubelle se centre dans `bottomSlot` ; sans emplacement, à
    ///   `MeeshySpacing.lg` du bord sûr bas, sur le milieu de la vue ;
    /// - un emplacement dont une mesure n'est pas finie est tenu pour absent ;
    /// - une cible non offerte n'a pas de centre.
    public static func centers(
        size: CGSize,
        safeTop: CGFloat,
        safeBottom: CGFloat,
        topSlot: CGRect?,
        bottomSlot: CGRect?,
        offered: Set<MeeshyDragTarget>
    ) -> [MeeshyDragTarget: CGPoint] {
        let radius = CGFloat(MeeshyDragTargetsRecipe.diameter) / 2
        var result: [MeeshyDragTarget: CGPoint] = [:]
        if offered.contains(.duplicate) {
            let slot = usable(topSlot)
            result[.duplicate] = CGPoint(
                x: slot?.midX ?? size.width / 2,
                y: (slot?.minY ?? safeTop + MeeshySpacing.lg) + radius
            )
        }
        if offered.contains(.remove) {
            let slot = usable(bottomSlot)
            result[.remove] = CGPoint(
                x: slot?.midX ?? size.width / 2,
                y: slot?.midY ?? size.height - safeBottom - MeeshySpacing.lg - radius
            )
        }
        return result
    }

    /// La cible survolée. Entrée à `captureRadius` ou moins du centre, sortie
    /// au-delà de `releaseRadius` : entre les deux, la cible déjà survolée est
    /// tenue (aucun battement à la frontière). Un point non fini ne survole rien.
    public static func hovered(
        finger: CGPoint,
        centers: [MeeshyDragTarget: CGPoint],
        previous: MeeshyDragTarget?
    ) -> MeeshyDragTarget? {
        guard finger.x.isFinite, finger.y.isFinite else { return nil }
        if let previous, let center = centers[previous],
           distance(finger, center) <= MeeshyDragTargetsRecipe.releaseRadius {
            return previous
        }
        return MeeshyDragTarget.allCases
            .compactMap { target in centers[target].map { (target, distance(finger, $0)) } }
            .filter { $0.1 <= MeeshyDragTargetsRecipe.captureRadius }
            .min { $0.1 < $1.1 }?.0
    }

    public static func distance(_ first: CGPoint, _ second: CGPoint) -> Double {
        let dx = Double(first.x - second.x)
        let dy = Double(first.y - second.y)
        return (dx * dx + dy * dy).squareRoot()
    }

    private static func usable(_ slot: CGRect?) -> CGRect? {
        guard let slot,
              [slot.origin.x, slot.origin.y, slot.size.width, slot.size.height].allSatisfy(\.isFinite)
        else { return nil }
        return slot
    }
}
