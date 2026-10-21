import UIKit
import SwiftUI
import MeeshySDK

// MARK: - Le rendu d'une tuile de motif (#10631, spec § 8.2)
//
// `UIGraphicsImageRenderer` plutôt qu'`ImageRenderer` : un rendu hors écran
// déterministe, sans SwiftUI, qui lit les MÊMES chemins que le web
// (`designTileSvg`) par `SVGPathData`. Les nombres du contrat sont en unités de
// tuile ; `scale` agrandit la tuile (0,5…3), jamais l'épaisseur seule.

@MainActor
enum AppearanceTileRenderer {

    static func tileImage(design: AppearanceDesign, isDark: Bool, accentHex: String, displayScale: CGFloat) -> UIImage? {
        guard let tile = design.tile, tile.width > 0, tile.height > 0 else { return nil }
        let key = AppearanceTileCache.key(design: design, isDark: isDark, accentHex: accentHex, displayScale: displayScale)
        return AppearanceTileCache.shared.image(forKey: key) {
            render(tile: tile, palette: design.palette(isDark ? .dark : .light), accentHex: accentHex, displayScale: displayScale)
        }
    }

    private static func render(tile: AppearanceDesignTile, palette: AppearanceDesignPalette, accentHex: String, displayScale: CGFloat) -> UIImage {
        let scale = CGFloat(tile.scale)
        let size = CGSize(width: tile.width * scale, height: tile.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = displayScale
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let cg = context.cgContext
            cg.setFillColor(UIColor(Color(hex: palette.base)).cgColor)
            cg.fill(CGRect(origin: .zero, size: size))
            cg.scaleBy(x: scale, y: scale)
            for stroke in tile.paths {
                draw(stroke, palette: palette, accentHex: accentHex, in: cg)
            }
        }
    }

    static func draw(_ stroke: AppearanceDesignStroke, palette: AppearanceDesignPalette, accentHex: String, in cg: CGContext) {
        let color = UIColor(AppearancePaint.color(stroke.role, palette: palette, accentHex: accentHex)).withAlphaComponent(stroke.opacity)
        cg.addPath(SVGPathData.make(stroke.d).cgPath)
        if let width = stroke.width {
            cg.setStrokeColor(color.cgColor)
            cg.setLineWidth(width)
            cg.strokePath()
        } else {
            cg.setFillColor(color.cgColor)
            cg.fillPath()
        }
    }
}
