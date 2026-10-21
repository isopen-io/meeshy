import CoreImage
import ImageIO
import UIKit

// MARK: - Cuire une chaîne CIImage, une fois, dans le contexte partagé (#9873)

extension StoryRenderingContext {

    /// **L'espace de sortie qui ne perd pas la gamme de la source** : une photo
    /// Display P3 (ou toute source wide-gamut) sort en Display P3, le reste en
    /// sRGB. Rabattre une photo P3 en sRGB parce qu'on l'a filtrée ternissait
    /// ses rouges et ses verts saturés dès le premier cran de curseur.
    public nonisolated func outputColorSpace(preserving source: CGColorSpace?) -> CGColorSpace {
        guard let source, source.isWideGamutRGB,
              let p3 = CGColorSpace(name: CGColorSpace.displayP3) else { return outputColorSpace }
        return p3
    }

    /// Le bitmap 8 bits de `image` sur `extent`, rendu par LE contexte partagé,
    /// dans l'espace qui garde la gamme de `source`.
    public nonisolated func bitmap(_ image: CIImage, from extent: CGRect, preserving source: CGColorSpace?) -> CGImage? {
        ciContext.createCGImage(image, from: extent, format: .RGBA8, colorSpace: outputColorSpace(preserving: source))
    }

    /// **L'espace où un look se calcule : la lumière LINÉAIRE** (sRGB étendu
    /// linéaire, celui d'un `CIContext()` par défaut). Le contexte du domaine
    /// travaille en Display P3 ENCODÉ (gamma) — juste pour composer, faux pour
    /// filtrer : une température, une exposition ou un fondu appliqués aux
    /// valeurs encodées agissent plus faiblement (« cool » sur un bleu saturé
    /// tombait sous le seuil visible du lecteur). Chaque étage de look entre
    /// donc en lumière linéaire et en ressort : l'aperçu, la vignette et
    /// l'export gardent la force qu'ils avaient avant la convergence.
    public nonisolated static func inLinearLight(_ image: CIImage, _ stage: (CIImage) -> CIImage) -> CIImage {
        guard let lineaire = CGColorSpace(name: CGColorSpace.extendedLinearSRGB),
              let entree = image.matchedFromWorkingSpace(to: lineaire) else { return stage(image) }
        let sortie = stage(entree)
        return sortie.matchedToWorkingSpace(from: lineaire) ?? sortie
    }

    /// **La source d'une chaîne, redressée par Core Image** : l'orientation
    /// EXIF de l'enveloppe `UIImage` est appliquée par `CIImage.oriented(_:)`,
    /// dans le graphe — le bitmap cuit est `.up` et `CanvasImageOrientation`
    /// n'a plus de copie redressée à dessiner à chaque cran.
    public nonisolated static func orientedSource(of image: UIImage) -> CIImage? {
        let brute = image.cgImage.map { CIImage(cgImage: $0) } ?? image.ciImage
        return brute?.oriented(CGImagePropertyOrientation(image.imageOrientation))
    }
}

extension CGImagePropertyOrientation {

    /// La correspondance documentée entre l'orientation d'une `UIImage` et
    /// l'orientation EXIF de son bitmap.
    nonisolated init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
