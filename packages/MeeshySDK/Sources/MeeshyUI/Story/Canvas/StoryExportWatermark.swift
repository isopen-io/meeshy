import CoreGraphics
import UIKit

/// Watermark baked over every exported frame, anchored bottom-trailing.
///
/// Building block opaque : l'appelant fournit l'image — le pipeline d'export
/// ne connaît pas la marque. La variante produit (logo dashes + wordmark)
/// vient de `MeeshyExportWatermark.make()`.
public struct StoryExportWatermark: @unchecked Sendable {
    /// `@unchecked Sendable` : `CGImage` est immuable et thread-safe ; la
    /// struct ne porte que des valeurs.
    public let image: CGImage
    /// Largeur du watermark en fraction de la largeur de rendu (clampée 0–1).
    public let widthFraction: CGFloat
    /// Marge depuis les bords bas et droit, en fraction de la largeur de rendu.
    public let marginFraction: CGFloat
    /// Alpha appliqué au dessin (clampé 0–1).
    public let opacity: CGFloat

    public init(image: CGImage,
                widthFraction: CGFloat = 0.24,
                marginFraction: CGFloat = 0.045,
                opacity: CGFloat = 0.85) {
        self.image = image
        self.widthFraction = min(1, max(0, widthFraction))
        self.marginFraction = min(0.5, max(0, marginFraction))
        self.opacity = min(1, max(0, opacity))
    }

    /// Rect de destination du watermark en coordonnées top-down (UIKit) pour
    /// une taille de rendu donnée. Le ratio de l'image est préservé.
    public func frame(in renderSize: CGSize) -> CGRect {
        let width = renderSize.width * widthFraction
        let aspect = image.width > 0
            ? CGFloat(image.height) / CGFloat(image.width)
            : 1
        let height = width * aspect
        let margin = renderSize.width * marginFraction
        return CGRect(x: renderSize.width - margin - width,
                      y: renderSize.height - margin - height,
                      width: width,
                      height: height)
    }
}

/// Variante produit du watermark d'export : icône dashes Meeshy (géométrie
/// canonique de `MeeshyDashesShape`, espace 1024) + wordmark « meeshy » en
/// SF Rounded, blanc, ombre douce pour rester lisible sur fond clair.
@MainActor
public enum MeeshyExportWatermark {

    /// Géométrie canonique des trois dashes (espace 1024 de `MeeshyDashesShape`).
    private static let dashes: [(from: CGPoint, to: CGPoint)] = [
        (CGPoint(x: 262, y: 384), CGPoint(x: 762, y: 384)),
        (CGPoint(x: 262, y: 512), CGPoint(x: 662, y: 512)),
        (CGPoint(x: 262, y: 640), CGPoint(x: 562, y: 640)),
    ]
    private static let dashLineWidth: CGFloat = 112

    public static func make() -> StoryExportWatermark? {
        // Bounding box réel du glyphe dans l'espace 1024 (lignes + demi-épaisseur).
        let half = dashLineWidth / 2
        let glyphBox = CGRect(x: 262 - half, y: 384 - half,
                              width: (762 - 262) + dashLineWidth,
                              height: (640 - 384) + dashLineWidth)

        let iconHeight: CGFloat = 84
        let iconScale = iconHeight / glyphBox.height
        let iconWidth = glyphBox.width * iconScale

        let font = UIFont.systemFont(ofSize: 76, weight: .semibold).rounded()
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.white,
        ]
        let word = "meeshy" as NSString
        let textSize = word.size(withAttributes: attributes)

        let gap: CGFloat = 22
        let padding: CGFloat = 8   // évite que l'ombre soit rognée aux bords
        let canvas = CGSize(
            width: ceil(iconWidth + gap + textSize.width) + padding * 2,
            height: ceil(max(iconHeight, textSize.height)) + padding * 2
        )

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: canvas, format: format)
        let rendered = renderer.image { context in
            let cg = context.cgContext
            cg.setShadow(offset: CGSize(width: 0, height: 2), blur: 6,
                         color: UIColor.black.withAlphaComponent(0.45).cgColor)

            cg.saveGState()
            cg.translateBy(x: padding,
                           y: padding + (canvas.height - padding * 2 - iconHeight) / 2)
            cg.scaleBy(x: iconScale, y: iconScale)
            cg.translateBy(x: -glyphBox.origin.x, y: -glyphBox.origin.y)
            cg.setStrokeColor(UIColor.white.cgColor)
            cg.setLineWidth(dashLineWidth)
            cg.setLineCap(.round)
            for dash in dashes {
                cg.move(to: dash.from)
                cg.addLine(to: dash.to)
                cg.strokePath()
            }
            cg.restoreGState()

            word.draw(
                at: CGPoint(x: padding + iconWidth + gap,
                            y: padding + (canvas.height - padding * 2 - textSize.height) / 2),
                withAttributes: attributes
            )
        }

        guard let cgImage = rendered.cgImage else { return nil }
        return StoryExportWatermark(image: cgImage)
    }
}

private extension UIFont {
    func rounded() -> UIFont {
        guard let descriptor = fontDescriptor.withDesign(.rounded) else { return self }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}
