import CoreGraphics
import UIKit

/// **Le mode édition** (#9352, spec § 3.3) : même interface, la source change.
///
/// La photo prise par la scène ne part plus aussitôt : elle se FIGE, debout, et
/// devient la source du peintre unique — le look et le cadrage se règlent sur
/// elle, et rien n'est remis à l'hôte avant « Terminé ». L'objectif, lui, se
/// repose : l'édition ne lit plus aucune trame.
extension ComposerCaptureSession {

    /// La photo s'ouvre en édition, avec les octets de sa prise : leur EXIF
    /// suivra le rendu final. Une image sans pixels n'ouvre rien.
    func beginEditing(photo image: UIImage, data: Data? = nil) {
        guard let debout = ComposerPhotoLookSource.upright(image) else { return }
        editPhoto = debout
        editPhotoData = data
        editSource = ComposerStillSource(debout)
        framing = .identity
        openFamily = nil
        phase = .editing(.photo)
        camera.pauseRunning()
    }

    /// « Fermer » en édition : on revient viser ; la prise est abandonnée.
    func cancelEditing() {
        leaveEditing()
        camera.resumeRunning()
    }

    /// La phase revient à la capture et la source éditée est relâchée — sans
    /// toucher à l'objectif : qui désarme le ferme, qui annule le relance.
    func leaveEditing() {
        phase = .capturing
        editPhoto = nil
        editPhotoData = nil
        editSource = nil
        framing = .identity
    }

    /// L'étendue de la source éditée ; `nil` hors édition.
    var editExtent: CGRect? {
        editSource?.latestImage()?.extent
    }

    /// Les proportions de la case où le média se pose : la découpe du cadre, le
    /// canevas 9:16 sinon. La scène de l'aperçu ou de la miniature sert si elle est
    /// cuite ; sinon la miniature (162×288, une milliseconde) se cuit ici — un cache
    /// froid ne doit jamais faire cadrer en 9:16 un média qui part dans une case 4:5.
    var framingAspect: CGFloat {
        let neutre = ComposerLookPainter.designCanvas.width / ComposerLookPainter.designCanvas.height
        guard look.frame != ComposerPhotoFrame.none else { return neutre }
        let cles = [ComposerLookPainter.designCanvas, ComposerLookPainter.thumbnailCanvas].map {
            ComposerLookSceneKey(look: look, canvas: $0, date: lookDate, person: lookPerson)
        }
        let scene = cles.lazy.compactMap { self.scenes.cached($0) }.first ?? ComposerLookPainter.scene(for: cles[1])
        guard let photo = scene?.slots.first?.photo, photo.height > 0 else { return neutre }
        return photo.width / photo.height
    }

    /// Le doigt glisse : le média le suit, sans jamais sortir de sa case.
    func reframe(from anchor: ComposerFraming, translation: CGSize, viewSize: CGSize) {
        guard let source = editExtent else { return }
        framing = anchor.panned(by: translation, viewSize: viewSize, source: source, aspect: framingAspect)
    }

    /// Les doigts s'écartent : le média se rapproche, borné par `ComposerFraming.scaleRange`.
    func rezoom(from anchor: ComposerFraming, scale: CGFloat) {
        guard let source = editExtent else { return }
        framing = anchor.zoomed(by: scale, source: source, aspect: framingAspect)
    }
}
