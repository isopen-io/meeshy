import SwiftUI
import MeeshySDK

// MARK: - La Flamme (#9380)
//
// MIROIR des cinq formes de `docs/product/jeu-meeshy-conception.html` (§ II.6) :
//
//   Braise   1–6 j     petite, sans Signature
//   Flamme   7–29 j    la Signature blanche au cœur
//   Brasier  30–99 j   pleine hauteur
//   Astre    100–364 j un halo d'or en pointillé
//   Soleil   365 j et plus  un second halo, plus large
//
// La planche pose les petites flammes en les décalant vers le bas, ce qui les
// COUPE à la base du cadre ; ici la forme est réduite autour de son pied, elle
// reste entière et grandit avec la série.
//
// Elle vacille tant qu'elle est visible (1,6 s, aller-retour), et s'arrête
// quand l'utilisateur limite les animations ou que la vue quitte l'écran : un
// vacillement continu hors écran est une consommation pour rien.

public struct FlameView: View {

    private let form: FlameFormKey
    private let flickers: Bool
    private let accessibilityLabel: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var flickerPhase = false

    /// - Parameters:
    ///   - form: la forme (`GameFlame.form(forDays:)`).
    ///   - flickers: `false` pour une flamme fixe (miniature de liste, capture).
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit « Flamme de 12 jours ».
    public init(form: FlameFormKey, flickers: Bool = true, accessibilityLabel: String? = nil) {
        self.form = form
        self.flickers = flickers
        self.accessibilityLabel = accessibilityLabel
    }

    /// La hauteur de la flamme, de 0 à 1, selon sa forme.
    static func scale(of form: FlameFormKey) -> CGFloat {
        switch form {
        case .braise: 0.45
        case .flamme: 0.7
        case .brasier: 0.95
        case .astre, .soleil: 1
        }
    }

    private static let body = GameSVGPath.make(
        "M36 10 c 12 16 22 26 18 42 a18 18 0 0 1 -36 0 c -2 -12 8 -18 10 -28 c 4 6 6 10 8 12 c 2 -8 2 -16 0 -26 z")
    private static let foot = CGPoint(x: 36, y: 70)

    private var animates: Bool { flickers && !reduceMotion }

    public var body: some View {
        Canvas { context, size in
            let k = size.width / 72
            context.scaleBy(x: k, y: k)
            drawHalo(in: &context)
            drawFlame(in: &context)
        }
        .aspectRatio(1, contentMode: .fit)
        .scaleEffect(x: animates && flickerPhase ? 1.04 : 1, y: animates && flickerPhase ? 1.08 : 1,
                     anchor: UnitPoint(x: 0.5, y: 0.9))
        .onAppear {
            guard animates else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { flickerPhase = true }
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) { flickerPhase = false }
        }
        .gameAccessibility(label: accessibilityLabel)
    }

    private func drawHalo(in context: inout GraphicsContext) {
        guard form == .astre || form == .soleil else { return }
        let radius: CGFloat = form == .soleil ? 31 : 25
        context.stroke(
            Path(ellipseIn: CGRect(x: 36 - radius, y: 40 - radius, width: radius * 2, height: radius * 2)),
            with: .color(GamePalette.gold), style: StrokeStyle(lineWidth: 1.5, dash: [3, 4])
        )
    }

    private func drawFlame(in context: inout GraphicsContext) {
        let s = Self.scale(of: form)
        var local = context
        local.translateBy(x: Self.foot.x, y: Self.foot.y)
        local.scaleBy(x: s, y: s)
        local.translateBy(x: -Self.foot.x, y: -Self.foot.y)
        local.fill(Self.body, with: GameMaterial.flame.shading(in: Self.body.boundingRect))
        if form != .braise {
            GameSignature.draw(in: &local, center: CGPoint(x: 36, y: 54), side: 18, color: .white,
                               style: .flat, strokeWidth: 120)
        }
    }
}
