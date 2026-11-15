import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Contour de groupe — une forme PURE, éprouvée sans monter la vue

/// Le contour PLEIN d'une bulle selon sa position de groupe : fermé des
/// quatre côtés quand elle est seule, OUVERT du côté qu'elle partage avec sa
/// voisine. Le bord partagé n'est pas dessiné ici — c'est la jointure
/// pointillée (`RiverBubbleView.sharedEdge`), posée à part. Les coins ne
/// s'arrondissent qu'aux extrémités du groupe : un fond continu
/// (`UnevenRoundedRectangle`, mêmes rayons) relie les bulles sans encoche.
///
/// Directive produit 2026-08-22 : « bordure jointe en pointillé et partagée,
/// non pas des bordures fermées puis des pointillés en plus ».
nonisolated struct RiverBubbleOutline: Shape {
    let position: RiverGroupPosition
    let cornerRadius: CGFloat
    let lineWidth: CGFloat

    /// Rayons par coin — `r` aux coins EXTÉRIEURS du groupe, `0` là où la
    /// bulle rencontre sa voisine (même valeur pour le fond et le contour).
    static func cornerRadii(position: RiverGroupPosition, radius: CGFloat) -> RectangleCornerRadii {
        let top: CGFloat = position.joinsAbove ? 0 : radius
        let bottom: CGFloat = position.joinsBelow ? 0 : radius
        return RectangleCornerRadii(topLeading: top, bottomLeading: bottom, bottomTrailing: bottom, topTrailing: top)
    }

    func path(in rect: CGRect) -> Path {
        // Inset d'un demi-trait : le trait reste DANS la bulle, comme
        // `strokeBorder` — le canvas derrière ne le voit jamais déborder.
        let r = rect.insetBy(dx: lineWidth / 2, dy: lineWidth / 2)
        let radius = min(cornerRadius, min(r.width, r.height) / 2)
        var path = Path()
        switch position {
        case .solo:
            path.addRoundedRect(in: r, cornerSize: CGSize(width: radius, height: radius), style: .continuous)
        case .head:
            // Remonte le flanc gauche, ferme le haut par ses deux coins,
            // redescend le flanc droit — le bas reste ouvert.
            path.move(to: CGPoint(x: r.minX, y: r.maxY))
            path.addLine(to: CGPoint(x: r.minX, y: r.minY + radius))
            path.addArc(center: CGPoint(x: r.minX + radius, y: r.minY + radius), radius: radius,
                        startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            path.addLine(to: CGPoint(x: r.maxX - radius, y: r.minY))
            path.addArc(center: CGPoint(x: r.maxX - radius, y: r.minY + radius), radius: radius,
                        startAngle: .degrees(270), endAngle: .degrees(360), clockwise: false)
            path.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        case .middle:
            // Les deux flancs seulement — haut partagé, bas ouvert.
            path.move(to: CGPoint(x: r.minX, y: r.minY))
            path.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            path.move(to: CGPoint(x: r.maxX, y: r.minY))
            path.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        case .tail:
            // Descend le flanc gauche, ferme le bas par ses deux coins,
            // remonte le flanc droit — le haut est partagé.
            path.move(to: CGPoint(x: r.minX, y: r.minY))
            path.addLine(to: CGPoint(x: r.minX, y: r.maxY - radius))
            path.addArc(center: CGPoint(x: r.minX + radius, y: r.maxY - radius), radius: radius,
                        startAngle: .degrees(180), endAngle: .degrees(90), clockwise: true)
            path.addLine(to: CGPoint(x: r.maxX - radius, y: r.maxY))
            path.addArc(center: CGPoint(x: r.maxX - radius, y: r.maxY - radius), radius: radius,
                        startAngle: .degrees(90), endAngle: .degrees(0), clockwise: true)
            path.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        }
        return path
    }
}
