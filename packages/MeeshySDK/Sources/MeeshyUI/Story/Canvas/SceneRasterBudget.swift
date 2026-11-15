import CoreGraphics

/// **La résolution d'une image de scène est bornée, sa taille ne l'est pas**
/// (#14299).
///
/// Un objet posé grandit sans plafond ; l'image qui le peint (glyphe, gabarit,
/// pastille de lieu ou de son, texte) garde sa taille en points et voit sa
/// densité baisser au-delà de `maxPixelSide` pixels de côté. Le calque
/// l'étire à sa taille exacte. Au-delà, la netteté porterait sur des pixels
/// hors de l'écran, au prix de centaines de mégaoctets.
public nonisolated enum SceneRasterBudget {

    public static let maxPixelSide: CGFloat = 4096

    /// La densité (pixels par point) d'une image de `size` points, au plus
    /// `preferred`.
    public static func scale(for size: CGSize, preferred: CGFloat) -> CGFloat {
        let cote = max(size.width, size.height)
        guard cote.isFinite, cote > 0, preferred > 0 else { return preferred }
        return min(preferred, maxPixelSide / cote)
    }
}
