import SwiftUI
import MeeshySDK

// MARK: - La Signature (#9380)
//
// Les trois traits de la marque — `MeeshyDashesShape`, longueurs 500 · 400 · 300
// dans un carré de 1 024, opacités 0,7 · 1 · 0,75 — posés sur TOUT objet du jeu.
// Plus aucune bulle de conversation : la Signature est le seul ornement commun.
//
// Trois manières de la poser, selon la matière qui la porte :
//  - FRAPPÉE sur le métal (pièces, coupes) : relief, ombre en bas à droite,
//    éclat en haut à gauche ;
//  - GRAVÉE sur les blasons, badges et gemmes : creux, plus sombre que la matière ;
//  - À PLAT sur les fonds de couleur (anneaux, cœur de la Flamme, tampons).
// Les proportions sont fixes : la Signature n'est jamais déformée.

public enum SignatureStyle: Sendable, Equatable {
    case flat
    case struck
    case engraved
}

enum GameSignature {

    private static let dashOpacities: [Double] = [0.7, 1, 0.75]
    private static let shadow = GamePalette.signatureShadow

    /// Une couche : les trois traits, soit à leurs opacités propres, soit tous à
    /// `uniformOpacity`, décalés de `offset`.
    private struct Layer {
        let color: Color
        let uniformOpacity: Double?
        let offset: CGVector
    }

    private static func layers(style: SignatureStyle, color: Color, side: CGFloat) -> [Layer] {
        switch style {
        case .flat:
            [Layer(color: color, uniformOpacity: nil, offset: .zero)]
        case .struck:
            [
                Layer(color: shadow, uniformOpacity: 0.5, offset: CGVector(dx: side * 0.018, dy: side * 0.022)),
                Layer(color: .white, uniformOpacity: 0.85, offset: CGVector(dx: -side * 0.012, dy: -side * 0.014)),
                Layer(color: color, uniformOpacity: nil, offset: .zero),
            ]
        case .engraved:
            [
                Layer(color: .white, uniformOpacity: 0.35, offset: CGVector(dx: side * 0.012, dy: side * 0.016)),
                Layer(color: color, uniformOpacity: 0.85, offset: .zero),
            ]
        }
    }

    /// Dessine la Signature centrée en `center`, dans un carré de `side` (les
    /// unités du contexte), traits de `strokeWidth` unités sur 1 024.
    static func draw(in context: inout GraphicsContext, center: CGPoint, side: CGFloat, color: Color,
                     style: SignatureStyle = .flat, strokeWidth: CGFloat = 92) {
        // `MeeshyDashesShape` centre son dessin dans la TAILLE du rectangle et
        // ignore son origine : on lui donne un carré à l'origine, puis on déplace.
        let square = CGRect(x: 0, y: 0, width: side, height: side)
        let origin = CGPoint(x: center.x - side / 2, y: center.y - side / 2)
        let lineWidth = strokeWidth * side / 1024
        for layer in layers(style: style, color: color, side: side) {
            for index in 0..<3 {
                let path = MeeshyDashesShape(dashIndex: index)
                    .path(in: square)
                    .offsetBy(dx: origin.x + layer.offset.dx, dy: origin.y + layer.offset.dy)
                context.stroke(
                    path,
                    with: .color(layer.color.opacity(layer.uniformOpacity ?? dashOpacities[index])),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
            }
        }
    }
}

/// La Signature, seule, dans un carré qui prend toute la place offerte.
public struct SignatureMark: View {
    private let style: SignatureStyle
    private let color: Color
    private let strokeWidth: CGFloat
    private let accessibilityLabel: String?

    /// - Parameters:
    ///   - style: frappée, gravée ou à plat (voir l'en-tête du fichier).
    ///   - color: la teinte du trait, ou de l'encre gravée.
    ///   - strokeWidth: l'épaisseur en unités sur 1 024 — 92 par défaut, 120
    ///     sur un fond de couleur étroit.
    ///   - accessibilityLabel: `nil` ⇒ décorative, masquée ; l'hôte qui sait ce
    ///     que la Signature veut dire ici la libelle.
    public init(style: SignatureStyle = .flat, color: Color, strokeWidth: CGFloat = 92,
                accessibilityLabel: String? = nil) {
        self.style = style
        self.color = color
        self.strokeWidth = strokeWidth
        self.accessibilityLabel = accessibilityLabel
    }

    public var body: some View {
        Canvas { context, size in
            let side = min(size.width, size.height)
            GameSignature.draw(in: &context, center: CGPoint(x: size.width / 2, y: size.height / 2),
                               side: side, color: color, style: style, strokeWidth: strokeWidth)
        }
        .aspectRatio(1, contentMode: .fit)
        .gameAccessibility(label: accessibilityLabel)
    }
}
