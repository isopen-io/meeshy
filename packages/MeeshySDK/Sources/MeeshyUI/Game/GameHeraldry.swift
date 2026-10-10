import SwiftUI

// MARK: - Pièces héraldiques communes (#9380)

enum GameHeraldry {

    /// Une couronne d'or posée sur une tête : `head` est le point où elle repose.
    static func drawCrown(in context: inout GraphicsContext, head: CGPoint, scale: CGFloat = 1) {
        var crown = Path()
        let points: [(CGFloat, CGFloat)] = [(-8, 0), (-9, -9), (-4, -4), (0, -11), (4, -4), (9, -9), (8, 0)]
        for (index, point) in points.enumerated() {
            let p = CGPoint(x: head.x + point.0 * scale, y: head.y + point.1 * scale)
            if index == 0 { crown.move(to: p) } else { crown.addLine(to: p) }
        }
        crown.closeSubpath()
        context.fill(crown, with: GameMaterial.gold.shading(in: crown.boundingRect))
        context.stroke(crown, with: .color(GamePalette.ink.opacity(0.35)), lineWidth: 0.8 * scale)
    }

    /// Une auréole d'or au-dessus d'une tête.
    static func drawHalo(in context: inout GraphicsContext, head: CGPoint, scale: CGFloat = 1) {
        let halo = Path(ellipseIn: CGRect(x: head.x - 10 * scale, y: head.y - 4.5 * scale, width: 20 * scale, height: 6 * scale))
        context.stroke(halo, with: .color(GamePalette.gold), lineWidth: 2.2 * scale)
    }
}
