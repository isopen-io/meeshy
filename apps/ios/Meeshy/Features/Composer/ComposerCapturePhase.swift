import CoreGraphics
import CoreImage
import Foundation
import QuartzCore

/// Ce que l'édition retouche.
nonisolated enum ComposerEditMedia: Hashable, Sendable {
    case photo
    case video(URL)
}

/// **Deux phases, une interface** (#9352, spec § 4.3) : on vise, ou on retouche.
nonisolated enum ComposerCapturePhase: Hashable, Sendable {
    case capturing
    case editing(ComposerEditMedia)

    var isEditing: Bool {
        if case .editing = self { return true }
        return false
    }
}

/// **La photo figée, comme source du peintre** : une image, dessinée une fois ;
/// la vue ne redessine que si le look ou le cadrage change.
nonisolated final class ComposerStillSource: ComposerFrameSourcing, @unchecked Sendable {
    private let image: CIImage
    let declaredSpace: CGColorSpace?

    nonisolated deinit {}

    /// **L'écran ne lit jamais la photo pleine définition** (#10340). Le contexte
    /// ne garde rien d'un rendu à l'autre : chaque passage décodait la photo
    /// entière (12 Mpx et plus) sur le fil principal — à chaque image d'une
    /// animation d'outil, et pour chaque vignette. La source montre une copie à
    /// la taille de l'écran, décodée une fois ; la photo qui part se rend
    /// toujours depuis l'original (`editPhoto`).
    static let displayLongSide: CGFloat = 2048

    init(_ cgImage: CGImage) {
        image = CIImage(cgImage: Self.displayCopy(of: cgImage))
        declaredSpace = ComposerPhotoLookRule.colorSpace(of: cgImage)
    }

    /// La photo réduite à `displayLongSide` sur son plus grand côté, en bitmap
    /// déjà décodé ; une photo plus petite est rendue telle quelle, décodée.
    static func displayCopy(of cgImage: CGImage) -> CGImage {
        let taille = displaySize(of: CGSize(width: cgImage.width, height: cgImage.height))
        let espace = cgImage.colorSpace ?? CGColorSpaceCreateDeviceRGB()
        guard let contexte = CGContext(data: nil, width: Int(taille.width), height: Int(taille.height),
                                       bitsPerComponent: 8, bytesPerRow: 0, space: espace,
                                       bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return cgImage }
        contexte.interpolationQuality = .high
        contexte.draw(cgImage, in: CGRect(origin: .zero, size: taille))
        return contexte.makeImage() ?? cgImage
    }

    static func displaySize(of size: CGSize) -> CGSize {
        let plusGrand = max(size.width, size.height)
        guard plusGrand > displayLongSide else { return size }
        let echelle = displayLongSide / plusGrand
        return CGSize(width: (size.width * echelle).rounded(), height: (size.height * echelle).rounded())
    }

    func latestImage() -> CIImage? { image }

    /// Une image figée n'a qu'une trame : le peintre qui s'abonne est prévenu
    /// aussitôt, une fois ; le reste du temps, seul un changement de look ou de
    /// cadrage redessine.
    func setFrameHandler(_ handler: (@Sendable (_ presentedAt: TimeInterval) -> Void)?, for owner: ObjectIdentifier) {
        handler?(CACurrentMediaTime())
    }
}
