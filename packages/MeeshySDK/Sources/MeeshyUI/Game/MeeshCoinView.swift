import SwiftUI
import MeeshySDK

// MARK: - La Meesh, avers et revers (#9380)
//
// MIROIR de `coinAvers` / `coinRevers` de `docs/product/jeu-meeshy-conception.html`
// (§ IV.2). Avers : la Signature frappée, « MEESHY · UNE MEESH » en couronne,
// tranche cannelée (le pointillé). Revers : Mee et Meo face à face, GRAVÉS dans le
// métal et COLORÉS (relief : lumière haute, ombre basse, émail dans les creux —
// `GameEngravedBirds`, #9540), jamais deux autocollants ; le numéro de frappe et l'année. L'argent est la règle ; chaque centième est en or, chaque
// millième en prisme — des éditions qui ne valent rien de plus en jeu, elles se
// collectionnent.
//
// La brique DESSINE la pièce. Qu'elle se retourne, qu'une onde la frappe ou
// qu'un reflet la parcoure est la chorégraphie de l'app : les modificateurs
// `gameSpecularSheen`, `gameStrikeWave` et `gamePrismIridescence` s'y posent.

public struct MeeshCoinView: View {

    public enum Face: Sendable, Equatable {
        case obverse
        /// Le revers porte le numéro gravé et l'année de frappe.
        case reverse(number: Int, year: Int)
    }

    private let face: Face
    private let edition: MeeshEdition
    private let accessibilityLabel: String?

    @ScaledMetric(relativeTo: .body) private var typeScale: CGFloat = 1

    /// - Parameters:
    ///   - face: l'avers (Signature frappée) ou le revers (numéro et année).
    ///   - edition: argent, or (chaque centième) ou prisme (chaque millième).
    ///   - figures: IGNORÉ depuis #9540 — le revers EST Mee et Meo face à face, gravés dans le métal et colorés, quelle
    ///     que soit la taille ; la pièce ne porte plus de sticker (les films de Mee et de Meo). Le paramètre reste pour
    ///     ne casser aucun appelant.
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit « Meesh n° 13 ».
    public init(face: Face = .obverse, edition: MeeshEdition = .silver, figures: GameFigures? = .standard,
                accessibilityLabel: String? = nil) {
        self.face = face
        self.edition = edition
        self.accessibilityLabel = accessibilityLabel
    }

    private static let viewSize: CGFloat = 120
    private static let ringText = Array("MEESHY · UNE MEESH · MEESHY · UNE MEESH · ")

    private var metalStops: [Gradient.Stop] {
        switch edition {
        case .silver: GamePalette.coinSilver
        case .gold: GamePalette.coinGold
        case .prism: GamePalette.prismStops
        }
    }

    public var body: some View {
        ZStack {
            Canvas { context, size in
                let k = size.width / Self.viewSize
                context.scaleBy(x: k, y: k)
                drawBody(in: &context)
                switch face {
                case .obverse: drawObverse(in: &context)
                case .reverse(let number, let year):
                    drawReverse(number: number, year: year, in: &context)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }

    // MARK: Le métal et la tranche

    private func drawBody(in context: inout GraphicsContext) {
        let outer = Path(ellipseIn: CGRect(x: 3, y: 3, width: 114, height: 114))
        context.fill(outer, with: GamePalette.diagonal(metalStops, in: outer.boundingRect))
        context.stroke(
            Path(ellipseIn: CGRect(x: 7, y: 7, width: 106, height: 106)),
            with: .color(GamePalette.coinRim),
            style: StrokeStyle(lineWidth: 1.4, dash: [1.4, 2])
        )
    }

    private func drawInner(radius: CGFloat, strokeWidth: CGFloat, in context: inout GraphicsContext) {
        let inner = Path(ellipseIn: CGRect(x: 60 - radius, y: 60 - radius, width: radius * 2, height: radius * 2))
        context.fill(inner, with: GamePalette.shading(GamePalette.coinSilverInner, from: .topTrailing, to: .bottomLeading,
                                                      in: inner.boundingRect))
        context.stroke(inner, with: .color(GamePalette.coinHighlight), lineWidth: strokeWidth)
    }

    // MARK: Avers

    private func drawObverse(in context: inout GraphicsContext) {
        drawInner(radius: 35, strokeWidth: 1.6, in: &context)
        drawRingText(in: &context)
        GameSignature.draw(in: &context, center: CGPoint(x: 60, y: 60), side: 66, color: GamePalette.coinInk,
                           style: .struck, strokeWidth: 100)
    }

    /// « MEESHY · UNE MEESH » autour de la pièce, de 9 h vers 12 h dans le sens
    /// horaire, les têtes des lettres vers l'extérieur — SVG pose le texte sur un
    /// chemin ; ici chaque lettre est posée et tournée à sa place.
    private func drawRingText(in context: inout GraphicsContext) {
        let count = Self.ringText.count
        let radius: CGFloat = 46
        for (index, letter) in Self.ringText.enumerated() where letter != " " {
            let angle = CGFloat.pi + CGFloat(index) * 2 * .pi / CGFloat(count)
            var local = context
            local.translateBy(x: 60 + radius * cos(angle), y: 60 + radius * sin(angle))
            local.rotate(by: .radians(Double(angle + .pi / 2)))
            local.draw(
                Text(String(letter)).font(.system(size: 8.4, weight: .medium, design: .monospaced))
                    .foregroundColor(GamePalette.coinInk),
                at: .zero, anchor: .center
            )
        }
    }

    // MARK: Revers

    /// Mee à gauche, Meo retourné à droite, face à face — les positions de la planche (`translate(13 30) scale(.34)` et
    /// `translate(107 30) scale(-.34 .34)`), gravés dans le métal avec leurs couleurs.
    private func drawEngravedBirds(in context: inout GraphicsContext) {
        GameEngravedBirds.draw(.meeJoy, in: &context, origin: CGPoint(x: 13, y: 30), scale: 0.34)
        GameEngravedBirds.draw(.meoOpen, in: &context, origin: CGPoint(x: 107, y: 30), scale: 0.34, flipped: true)
    }

    private func drawReverse(number: Int, year: Int, in context: inout GraphicsContext) {
        drawInner(radius: 45, strokeWidth: 1.4, in: &context)
        drawEngravedBirds(in: &context)
        let scale = min(typeScale, GameTypeScale.maximum)
        let numberSize = min(13 * max(scale, 1), 17)
        context.draw(
            Text("N° \(number)").font(.system(size: numberSize, weight: .heavy, design: .rounded))
                .foregroundColor(GamePalette.coinInk),
            at: CGPoint(x: 60, y: 96), anchor: .center
        )
        context.draw(
            Text(String(year)).font(.system(size: 8, weight: .medium, design: .monospaced)).kerning(2)
                .foregroundColor(GamePalette.coinInk),
            at: CGPoint(x: 60, y: 27), anchor: .center
        )
    }
}
