import CoreGraphics
import MeeshyUI

/// **Le cadre et le placement d'avant l'entrée dans Recadrer** (#15355) : ce
/// qu'« Annuler » rend.
nonisolated struct ComposerCropEntry: Equatable, Sendable {
    let aspect: CGFloat?
    let framing: ComposerFraming

    /// Le relevé après un toucher d'outil : ouvrir Recadrer relève le cadre du
    /// moment ; le refermer — le valider, ou le ranger sous Texte — l'oublie ;
    /// tout autre toucher le garde.
    static func after(_ kept: ComposerCropEntry?, before: Set<ComposerEditTool>, after: Set<ComposerEditTool>,
                      current: ComposerCropEntry) -> ComposerCropEntry? {
        guard after.contains(.crop) else { return nil }
        return before.contains(.crop) ? kept : current
    }
}

/// **Les commandes du recadrage** (#9567, #15355) : les formats, et « Annuler »,
/// qui rend le cadre d'avant l'entrée dans Recadrer en un geste et referme
/// l'outil sans abandonner la retouche. Valider, c'est retoucher « Recadrer ».
@MainActor
enum ComposerCropFlow {

    static func apply(_ preset: ComposerCropPreset, to session: ComposerCaptureSession) {
        session.setEditAspect(preset.aspect(source: session.editExtent?.size ?? .zero))
    }

    /// Le preset que la scène réalise ; `nil` pour un recadrage libre.
    static func preset(of session: ComposerCaptureSession) -> ComposerCropPreset? {
        session.editAspect.flatMap { ComposerCropPreset.matching($0, source: session.editExtent?.size ?? .zero) }
    }

    /// Hors du recadrage, ou pendant le rendu de « Terminé », rien ne bouge.
    static func cancel(_ session: ComposerCaptureSession) {
        guard session.phase.isEditing, !session.isRenderingLook, session.activeEditTools.contains(.crop),
              let avant = session.cropEntry else { return }
        session.editAspect = avant.aspect
        session.framing = avant.framing
        session.activeEditTools.remove(.crop)
        session.cropEntry = nil
        HapticFeedback.light()
    }
}

/// **La prise dépasse du cadre, voilée** (#15355, comme `ComposerCropStage`
/// sur Android) : on voit ce que le glissé fera entrer dans le cadre. Seul le
/// cadre part ; le voile n'est qu'un aperçu, peint sous lui.
///
/// Un cadre de l'appel pose la prise dans SA case, pas dans toute la scène :
/// rien ne dépasse alors du cadre de la retouche.
nonisolated enum ComposerCropOverflowLayout {

    static let veil: Double = 0.6

    static func shows(framesScene: Bool, look: ComposerPhotoLook) -> Bool {
        framesScene && look.frame == ComposerPhotoFrame.none
    }

    /// La prise ENTIÈRE à l'écran, posée pour que la fenêtre du cadrage tombe
    /// exactement sur le cadre. La fenêtre compte y vers le haut (Core Image),
    /// l'écran vers le bas.
    static func imageRect(frame: CGRect, window: CGRect, source: CGRect) -> CGRect? {
        guard window.width > 0, window.height > 0, source.width > 0, source.height > 0 else { return nil }
        let kx = frame.width / window.width
        let ky = frame.height / window.height
        return CGRect(x: frame.minX - (window.minX - source.minX) * kx,
                      y: frame.minY - (source.maxY - window.maxY) * ky,
                      width: source.width * kx, height: source.height * ky)
    }

    /// **La part de la prise qui tombe à l'écran, et le cadrage qui la peint** :
    /// une prise zoomée déborde de l'écran, et le voile n'en peint jamais plus
    /// que l'écran. Son échelle ne dépasse jamais celle du cadre (la part vue
    /// contient la fenêtre) : elle reste dans `ComposerFraming.scaleRange`.
    static func visible(frame: CGRect, window: CGRect, source: CGRect, screen: CGRect) -> ComposerCropOverflowPlacement? {
        guard let image = imageRect(frame: frame, window: window, source: source) else { return nil }
        let vue = image.intersection(screen)
        guard !vue.isNull, vue.width > 0, vue.height > 0 else { return nil }
        let kx = image.width / source.width
        let ky = image.height / source.height
        let part = CGRect(x: source.minX + (vue.minX - image.minX) / kx,
                          y: source.maxY - (vue.maxY - image.minY) / ky,
                          width: vue.width / kx, height: vue.height / ky)
        let aspect = vue.width / vue.height
        let plein = source.width / source.height > aspect ? source.height * aspect : source.width
        let cadrage = ComposerFraming(center: CGPoint(x: (part.midX - source.minX) / source.width,
                                                      y: (part.midY - source.minY) / source.height),
                                      scale: plein / part.width)
        return ComposerCropOverflowPlacement(rect: vue, framing: cadrage)
    }
}

/// Où le voile se pose à l'écran, et le cadrage qui y peint la prise.
nonisolated struct ComposerCropOverflowPlacement: Equatable, Sendable {
    let rect: CGRect
    let framing: ComposerFraming
}
