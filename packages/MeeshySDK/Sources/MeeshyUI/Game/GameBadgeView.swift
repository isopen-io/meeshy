import SwiftUI
import MeeshySDK

// MARK: - Les badges (#9380)
//
// MIROIR des formes et des matières de `docs/product/jeu-meeshy-conception.html`
// (§ II.7) — trois FORMES qui disent la nature du badge, sept MATIÈRES qui disent
// sa hauteur :
//
//   accumulation  hexagone  combien de fois (Cuivre 1 · Bronze 10 · Argent 50 ·
//                           Or 100 · Platine 500 · Obsidienne 1 000 · Prisme 5 000)
//   record        losange   le meilleur
//   collection    médaillon à réunir (pastilles pleines / vides)
//
// La Signature est GRAVÉE dans la matière. Un badge ÉTEINT (une frappe l'a fait
// redescendre) devient une EMPREINTE : contour en pointillé, Signature à plat
// éteinte, et ce qu'il manque pour le rallumer (« −37 »).

public struct GameBadgeView: View {

    public enum Shape: Sendable, Equatable {
        case accumulation
        case record
        /// `filled` pastilles pleines sur `total`.
        case collection(filled: Int, total: Int)
    }

    public enum State: Sendable, Equatable {
        case lit
        /// L'empreinte d'un badge éteint.
        case imprint
    }

    private let shape: Shape
    private let material: GameMaterial
    private let state: State
    private let label: String?
    private let surface: Color
    private let muted: Color
    private let accent: Color
    private let accessibilityLabel: String?

    @ScaledMetric(relativeTo: .caption) private var typeScale: CGFloat = 1

    /// - Parameters:
    ///   - shape: hexagone (accumulation), losange (record) ou médaillon (collection).
    ///   - material: Cuivre → Prisme.
    ///   - state: allumé, ou empreinte d'un badge éteint.
    ///   - label: le chiffre sous la Signature (seuil, ou « −37 » pour une empreinte).
    ///   - surface: le fond du médaillon (la couleur de surface de l'hôte).
    ///   - muted: la teinte éteinte de l'empreinte.
    ///   - accent: la couleur des pastilles pleines du médaillon.
    ///   - accessibilityLabel: `nil` ⇒ décoratif ; l'hôte dit « Messages, Or ».
    public init(shape: Shape = .accumulation, material: GameMaterial, state: State = .lit, label: String? = nil,
                surface: Color = .white, muted: Color = .gray, accent: Color = MeeshyColors.indigo500,
                accessibilityLabel: String? = nil) {
        self.shape = shape
        self.material = material
        self.state = state
        self.label = label
        self.surface = surface
        self.muted = muted
        self.accent = accent
        self.accessibilityLabel = accessibilityLabel
    }

    private static let hexagon = GameSVGPath.make("M36 4 L64 20 L64 52 L36 68 L8 52 L8 20 Z")
    private static let diamond = GameSVGPath.make("M36 3 L66 36 L36 69 L6 36 Z")

    public var body: some View {
        Canvas { context, size in
            let k = size.width / 72
            context.scaleBy(x: k, y: k)
            switch (state, shape) {
            case (.imprint, _): drawImprint(in: &context)
            case (.lit, .accumulation): drawHexagon(in: &context)
            case (.lit, .record): drawDiamond(in: &context)
            case (.lit, .collection(let filled, let total)): drawMedallion(filled: filled, total: total, in: &context)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    private var digitSize: CGFloat { 8 * min(max(typeScale, 1), GameTypeScale.maximum) }

    private func drawLabel(_ text: String, color: Color, y: CGFloat, size: CGFloat, in context: inout GraphicsContext) {
        context.draw(
            Text(text).font(.system(size: size, weight: .medium, design: .monospaced)).foregroundColor(color),
            at: CGPoint(x: 36, y: y), anchor: .center
        )
    }

    private func drawHexagon(in context: inout GraphicsContext) {
        context.fill(Self.hexagon, with: material.shading(in: Self.hexagon.boundingRect))
        context.stroke(Self.hexagon, with: .color(GamePalette.ink.opacity(0.25)), lineWidth: 1)
        GameSignature.draw(in: &context, center: CGPoint(x: 36, y: 32), side: 34, color: material.ink,
                           style: .engraved, strokeWidth: 100)
        if let label { drawLabel(label, color: material.ink, y: 58, size: digitSize, in: &context) }
    }

    private func drawDiamond(in context: inout GraphicsContext) {
        context.fill(Self.diamond, with: GameMaterial.platinum.shading(in: Self.diamond.boundingRect))
        context.stroke(Self.diamond, with: .color(GamePalette.ink.opacity(0.25)), lineWidth: 1)
        GameSignature.draw(in: &context, center: CGPoint(x: 36, y: 36), side: 34, color: GameMaterial.platinum.ink,
                           style: .engraved, strokeWidth: 100)
        if let label { drawLabel(label, color: GameMaterial.platinum.ink, y: 58, size: digitSize, in: &context) }
    }

    private func drawMedallion(filled: Int, total: Int, in context: inout GraphicsContext) {
        let ring = Path(ellipseIn: CGRect(x: 5, y: 5, width: 62, height: 62))
        context.fill(ring, with: GamePalette.diagonal(GamePalette.prismStops, in: ring.boundingRect))
        context.fill(Path(ellipseIn: CGRect(x: 12, y: 12, width: 48, height: 48)), with: .color(surface))
        let count = max(1, total)
        for step in 0..<count {
            let angle = CGFloat(step) / CGFloat(count) * 2 * .pi - .pi / 2
            let dot = Path(ellipseIn: CGRect(x: 36 + 18 * cos(angle) - 3.6, y: 36 + 18 * sin(angle) - 3.6, width: 7.2, height: 7.2))
            if step < filled { context.fill(dot, with: .color(accent)) }
            context.stroke(dot, with: .color(accent), lineWidth: 1.4)
        }
        GameSignature.draw(in: &context, center: CGPoint(x: 36, y: 36), side: 22, color: GamePalette.ink,
                           style: .flat, strokeWidth: 110)
    }

    private func drawImprint(in context: inout GraphicsContext) {
        context.stroke(Self.hexagon, with: .color(muted), style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
        GameSignature.draw(in: &context, center: CGPoint(x: 36, y: 32), side: 34, color: muted,
                           style: .flat, strokeWidth: 90)
        if let label { drawLabel(label, color: muted, y: 58, size: digitSize * 9 / 8, in: &context) }
    }
}
