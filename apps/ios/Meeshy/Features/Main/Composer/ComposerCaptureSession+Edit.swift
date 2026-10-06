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

    /// La vidéo assemblée s'ouvre en édition, en boucle : le peintre la lit comme
    /// il lisait l'objectif, à la cadence du palier et dans l'espace de l'aperçu.
    /// Une vidéo qui ne se lit pas part telle quelle plutôt que d'être perdue ;
    /// un viseur fermé pendant le chargement n'ouvre rien.
    func beginEditing(video url: URL) async {
        let generation = renderGeneration
        let charge = await loopPlayerFactory(url)
        guard generation == renderGeneration else { return }
        guard let lecteur = charge else {
            onDeliver?(.video(url))
            return
        }
        loopPlayer = lecteur
        editSource = lecteur
        framing = .identity
        trim = 0...lecteur.duration
        openFamily = nil
        phase = .editing(.video(url))
        camera.pauseRunning()
        lecteur.configure(fps: ComposerCaptureSurfaceRule.editFPS(thermalBudget),
                          declaredSpace: camera.liveFeed.declaredSpace)
        lecteur.play()
    }

    /// « Fermer » en édition : on revient viser ; la prise est abandonnée.
    func cancelEditing() {
        leaveEditing()
        camera.resumeRunning()
    }

    /// La phase revient à la capture et la source éditée est relâchée — la
    /// boucle s'arrête, une fois — sans toucher à l'objectif : qui désarme le
    /// ferme, qui annule le relance.
    func leaveEditing() {
        let lecteur = loopPlayer
        loopPlayer = nil
        lecteur?.stop()
        trim = nil
        phase = .capturing
        editPhoto = nil
        editPhotoData = nil
        editSource = nil
        framing = .identity
    }

    /// L'étendue de la source éditée ; `nil` hors édition. Une vidéo la connaît
    /// avant sa première trame : le cadrage n'attend pas la lecture.
    var editExtent: CGRect? {
        if let lecteur = loopPlayer { return CGRect(origin: .zero, size: lecteur.uprightSize) }
        return editSource?.latestImage()?.extent
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
