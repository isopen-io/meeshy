import CoreGraphics

/// **Les boutons de l'appel réduit sont PETITS** (#19671, retour porteur) : couper
/// le micro, couper la sortie du son et raccrocher, posés autour du disque (appui long) ou en barre
/// sous les paliers rectangle, sont dessinés en disques de `paintedDiameter`, en audio comme en
/// vidéo. Seule la PEINTURE rétrécit : la cible tactile reste de 44 pt (HIG), et elle ne mord
/// jamais sur le disque, qui garde son toucher (revenir à l'appel). Une loi pure : la vue la lit.
nonisolated enum CallReducedControlsLaw {
    static let paintedDiameter: CGFloat = 30
    static let hitTarget: CGFloat = 44
    /// L'écart PEINT entre le disque et un bouton.
    static let visualGap: CGFloat = 6
    /// L'écart entre deux boutons de la barre des paliers rectangle.
    static let barSpacing: CGFloat = 4
    /// Ce que le bouton le plus au bord laisse libre jusqu'au bord de l'écran.
    static let screenClearance: CGFloat = 8

    /// La distance entre le centre du disque et celui d'un bouton : l'écart peint, sauf si la
    /// cible tactile mordait alors sur le disque.
    static func centerOffset(diskDiameter: CGFloat) -> CGFloat {
        let radius = diskDiameter / 2
        return max(radius + visualGap + paintedDiameter / 2, radius + hitTarget / 2)
    }

    /// Ce que la cible tactile d'un bouton dépasse du bord du disque.
    static func touchReach(diskDiameter: CGFloat) -> CGFloat {
        centerOffset(diskDiameter: diskDiameter) - diskDiameter / 2 + hitTarget / 2
    }

    /// Ce que la peinture d'un bouton dépasse du bord du disque.
    static func paintedReach(diskDiameter: CGFloat) -> CGFloat {
        centerOffset(diskDiameter: diskDiameter) - diskDiameter / 2 + paintedDiameter / 2
    }

    /// Le décalage horizontal du disque, menu ouvert, pour que le bouton du côté du bord reste
    /// entier à l'écran. Rien quand la marge du disque suffit déjà.
    static func clusterShift(edge: BubbleHorizontalEdge, edgeMargin: CGFloat, diskDiameter: CGFloat) -> CGFloat {
        let overflow = paintedReach(diskDiameter: diskDiameter) + screenClearance - edgeMargin
        guard overflow > 0 else { return 0 }
        switch edge {
        case .trailing: return -overflow
        case .leading: return overflow
        }
    }
}
