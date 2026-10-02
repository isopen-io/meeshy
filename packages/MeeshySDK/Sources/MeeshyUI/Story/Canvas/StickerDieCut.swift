import UIKit

/// **Le contour blanc découpé d'un sticker** (#9060) — celui de Mee et Meo
/// (`apps/web/src/lib/mee/render.ts`, `dieCut`), porté aux gabarits.
///
/// Mêmes proportions que le filtre SVG : un papier blanc qui déborde du dessin
/// de 1,6 % de son côté, et une ombre d'encre douce décalée vers le bas. Le
/// papier est la silhouette du dessin peinte en blanc autour de lui, sur seize
/// directions — une dilatation sans CoreImage, que la plus fine des lettres
/// d'un cartouche ne traverse pas.
///
/// Une COUCHE DE PRÉSENTATION : la feuille, la bulle et le PNG envoyé la
/// portent ; la scène d'une story, dont la géométrie est celle du document, ne
/// la porte pas.
public enum StickerDieCut {

    /// La part du côté le plus long que le papier déborde (3,2 / 200 chez Mee).
    static let outlineRatio: CGFloat = 0.016
    static let minimumOutline: CGFloat = 2
    static let ink = UIColor(red: 28 / 255, green: 25 / 255, blue: 65 / 255, alpha: 0.26)

    static func outline(for size: CGSize) -> CGFloat {
        max(minimumOutline, max(size.width, size.height) * outlineRatio)
    }

    /// Le papier, puis l'ombre qui déborde de lui : la marge ajoutée sur
    /// chaque bord.
    public static func margin(for size: CGSize) -> CGFloat {
        (outline(for: size) * 2.6).rounded(.up)
    }

    public static func apply(to image: UIImage) -> UIImage {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return image }
        let rayon = outline(for: size)
        let marge = margin(for: size)
        let papier = silhouette(of: image, in: .white)
        let format = UIGraphicsImageRendererFormat()
        format.scale = image.scale
        format.opaque = false
        let toile = CGSize(width: size.width + 2 * marge, height: size.height + 2 * marge)
        return UIGraphicsImageRenderer(size: toile, format: format).image { context in
            let cg = context.cgContext
            cg.saveGState()
            cg.setShadow(offset: CGSize(width: 0, height: rayon * 0.7), blur: rayon * 1.5, color: ink.cgColor)
            cg.beginTransparencyLayer(auxiliaryInfo: nil)
            for anneau in [rayon, rayon * 0.5] {
                for pas in 0..<16 {
                    let angle = CGFloat(pas) / 16 * 2 * .pi
                    papier.draw(at: CGPoint(x: marge + cos(angle) * anneau, y: marge + sin(angle) * anneau))
                }
            }
            cg.endTransparencyLayer()
            cg.restoreGState()
            image.draw(at: CGPoint(x: marge, y: marge))
        }
    }

    /// Le dessin réduit à sa forme, peinte d'une seule couleur.
    private static func silhouette(of image: UIImage, in color: UIColor) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = image.scale
        format.opaque = false
        return UIGraphicsImageRenderer(size: image.size, format: format).image { context in
            image.draw(at: .zero)
            color.setFill()
            context.fill(CGRect(origin: .zero, size: image.size), blendMode: .sourceIn)
        }
    }
}
