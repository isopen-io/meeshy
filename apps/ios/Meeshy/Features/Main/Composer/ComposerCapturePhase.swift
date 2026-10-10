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

    init(_ cgImage: CGImage) {
        image = CIImage(cgImage: cgImage)
        declaredSpace = ComposerPhotoLookRule.colorSpace(of: cgImage)
    }

    func latestImage() -> CIImage? { image }

    /// Une image figée n'a qu'une trame : le peintre qui s'abonne est prévenu
    /// aussitôt, une fois ; le reste du temps, seul un changement de look ou de
    /// cadrage redessine.
    func setFrameHandler(_ handler: (@Sendable (_ presentedAt: TimeInterval) -> Void)?, for owner: ObjectIdentifier) {
        handler?(CACurrentMediaTime())
    }
}
