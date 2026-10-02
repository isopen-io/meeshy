import QuartzCore
import CoreGraphics

/// **Pincer un texte agrandit son CADRE entier** (#9139, demande porteur
/// 2026-10-02).
///
/// La taille choisie à l'édition (`fontSize`) fige le texte ET sa forme : la
/// mise en ligne se calcule toujours à l'échelle 1, contre la largeur de coupe
/// du canvas. `scale` — le pincement — ne fait qu'agrandir ce cadre,
/// uniformément, par la transformation du calque : police, largeur de coupe,
/// marges, liseré et fond grandissent ensemble, et les lignes restent celles
/// qu'on a écrites, pendant le geste comme après le lâcher, en lecture comme à
/// l'export.
///
/// Auparavant l'échelle était CUITE dans la police (`fontSize × scale`) contre
/// une largeur de coupe fixe (88 % du canvas) : agrandir un texte de deux
/// lignes en faisait quatre au lâcher, le réduire les recollait en une.
extension StoryTextLayer {

    /// Côté maximal (pixels) de la texture d'un texte agrandi. Au-delà, le
    /// gain de netteté porte sur des pixels hors de l'écran et coûte de la
    /// mémoire pour rien (un texte ×4 de 350 pt à 3× pèserait 4 200 px de côté).
    nonisolated static let maxRasterSide: CGFloat = 4096

    /// Transformation de scène d'un texte : rotation du modèle composée de
    /// l'échelle uniforme du cadre. Les deux commutent en 2D, l'ordre est
    /// indifférent. Une échelle ≤ 0 (donnée corrompue) rend la rotation seule.
    nonisolated static func sceneTransform(rotationDegrees: Double, scale: Double) -> CATransform3D {
        let rotation = CATransform3DMakeRotation(CGFloat(rotationDegrees) * .pi / 180, 0, 0, 1)
        guard scale > 0, scale != 1 else { return rotation }
        return CATransform3DScale(rotation, CGFloat(scale), CGFloat(scale), 1)
    }

    /// Densité de rasterisation d'un texte mis à l'échelle par transformation :
    /// celle de l'écran multipliée par l'échelle, pour que les glyphes restent
    /// NETS une fois agrandis (jamais un bitmap étiré). Un texte réduit
    /// rasterise moins dense, à la densité qu'il occupe réellement. Le plafond
    /// borne la texture d'un très grand texte, sans jamais descendre sous la
    /// densité de l'écran.
    nonisolated static func rasterScale(renderScale: CGFloat,
                                        objectScale: Double,
                                        longestSide: CGFloat) -> CGFloat {
        guard objectScale > 0 else { return renderScale }
        let wanted = renderScale * CGFloat(objectScale)
        guard objectScale > 1, longestSide > 0 else { return wanted }
        return max(renderScale, min(wanted, maxRasterSide / longestSide))
    }
}
