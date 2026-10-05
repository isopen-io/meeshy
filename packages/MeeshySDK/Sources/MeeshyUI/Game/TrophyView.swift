import SwiftUI

// MARK: - Les coupes et trophées (#9380)
//
// MIROIR de `cup()` de `docs/product/jeu-meeshy-conception.html` (§ IV.4) : une
// coupe de métal, la Signature FRAPPÉE sur la panse, une plaque sombre qui porte
// l'inscription (« JADE · S41 », « SAISON 1 », « 365 JOURS »). Le trophée de
// Prestige ajoute Mee et Meo couronnés à sa base.
//
//   coupe de ligue    or, argent ou bronze
//   coupe de saison   platine
//   Prestige          prisme, avec ses deux tenants couronnés
//   trophée de Flamme matière `flame`

public struct TrophyView: View {

    private let material: GameMaterial
    private let label: String
    private let figures: GameFigures?
    private let accessibilityLabel: String?

    /// - Parameters:
    ///   - material: la matière de la coupe (`.gold`, `.platinum`, `.prism`, `.flame`…).
    ///   - label: l'inscription de la plaque — localisée et courte (≈ 12 signes).
    ///   - figures: Mee et Meo couronnés à la base (Prestige) ; `nil` pour une coupe seule.
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit « Coupe de saison 1 ».
    public init(material: GameMaterial, label: String, figures: GameFigures? = nil,
                accessibilityLabel: String? = nil) {
        self.material = material
        self.label = label
        self.figures = figures
        self.accessibilityLabel = accessibilityLabel
    }

    private static let handles = GameSVGPath.make("M30 22 c-17 0 -19 24 3 28 M90 22 c17 0 19 24 -3 28")
    private static let bowl = GameSVGPath.make("M30 12 h60 v22 c0 22 -14 36 -30 38 c-16 -2 -30 -16 -30 -38 z")

    private var viewBox: CGSize { CGSize(width: figures == nil ? 120 : 170, height: 124) }
    private var cupOffset: CGFloat { figures == nil ? 0 : 25 }

    public var body: some View {
        ZStack {
            Canvas { context, size in
                let k = size.width / viewBox.width
                context.scaleBy(x: k, y: k)
                context.translateBy(x: cupOffset, y: 0)
                drawCup(in: &context)
            }
            if let figures {
                GameTenantsLayer(
                    figures: figures, viewBox: viewBox,
                    mee: .init(center: CGPoint(x: 30, y: 88), side: 60),
                    meo: .init(center: CGPoint(x: 140, y: 88), side: 60)
                )
                Canvas { context, size in
                    let k = size.width / viewBox.width
                    context.scaleBy(x: k, y: k)
                    for x in [30.0, 140.0] {
                        GameHeraldry.drawCrown(in: &context, head: CGPoint(x: x, y: 88 - 60 * 0.27), scale: 1.1)
                    }
                }
            }
        }
        .aspectRatio(viewBox.width / viewBox.height, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    private func drawCup(in context: inout GraphicsContext) {
        let metal = material.shading(in: Self.bowl.boundingRect)
        context.stroke(Self.handles, with: material.shading(in: Self.handles.boundingRect),
                       style: StrokeStyle(lineWidth: 5))
        context.fill(Self.bowl, with: metal)
        context.stroke(Self.bowl, with: .color(GamePalette.ink.opacity(0.3)), lineWidth: 1)
        context.fill(Path(CGRect(x: 54, y: 72, width: 12, height: 16)), with: metal)
        context.fill(Path(roundedRect: CGRect(x: 36, y: 88, width: 48, height: 9), cornerRadius: 2), with: metal)
        context.fill(Path(roundedRect: CGRect(x: 30, y: 97, width: 60, height: 17), cornerRadius: 3),
                     with: .color(GamePalette.ink.opacity(0.88)))
        GameSignature.draw(in: &context, center: CGPoint(x: 60, y: 38), side: 42, color: material.ink,
                           style: .struck, strokeWidth: 100)
        context.draw(
            Text(label).font(.system(size: 7.5, weight: .medium, design: .monospaced)).kerning(1)
                .foregroundColor(.white),
            at: CGPoint(x: 60, y: 105.5), anchor: .center
        )
    }
}
