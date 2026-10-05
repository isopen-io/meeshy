import CoreGraphics
import Foundation

// MARK: - Le toucher du viseur (#9464)

extension ComposerCaptureSession {

    /// Ce que fait ce toucher — viser, ou prendre la photo s'il finit un double.
    /// Un double fini oublie son premier toucher : un troisième en ouvre un nouveau.
    func tapAction(at now: Date = Date()) -> ComposerCaptureTapRule.Action {
        let action = ComposerCaptureTapRule.action(stage: stage, now: now,
                                                   lastTapAt: lastViewfinderTapAt, armedAt: armedAt)
        lastViewfinderTapAt = action == .photo ? nil : now
        return action
    }

    /// **Le toucher vise ce point de l'aperçu** (#9295, #9464), converti selon
    /// l'image AFFICHÉE. `false` ⇒ rien n'a été visé (pas d'image, toucher hors
    /// de l'image ou sur un cadre, objectif qui ne règle rien) : ni anneau ni
    /// vibration pour une mise au point qui n'a pas eu lieu.
    @discardableResult
    func focus(atPreviewPoint point: CGPoint, previewSize: CGSize) -> Bool {
        guard ComposerCaptureFocus.focusesOnTap(stage: stage) else { return false }
        let (image, visible) = focusImage(in: previewSize)
        guard visible.contains(point),
              let capteur = ComposerCaptureFocusGeometry.devicePoint(viewPoint: point, imageRect: image,
                                                                     mirrored: controls.currentPosition == .front),
              controls.focus(at: capteur, smooth: stage == .recording) else { return false }
        HapticFeedback.light()
        return true
    }

    /// Où l'image se montre dans l'aperçu, et la part qu'on en voit : toute la
    /// toile, ou la case du cadre que la vue Metal peint.
    private func focusImage(in size: CGSize) -> (image: CGRect, visible: CGRect) {
        let ecran = CGRect(origin: .zero, size: size)
        let toile = ComposerLookPainter.designCanvas
        let source = camera.liveFeed.latestImage()?.extent.size ?? toile
        let cle = ComposerLookSceneKey(look: look, canvas: toile, date: lookDate, person: lookPerson)
        guard paintsWithMetal, let trou = ComposerLookSceneCache.shared.cached(cle)?.slots.first?.photo else {
            return (ComposerCaptureFocusGeometry.filled(source: source, into: ecran), ecran)
        }
        let trouAffiche = ComposerCaptureFocusGeometry.slotInView(trou, canvas: toile, view: size)
        return (ComposerCaptureFocusGeometry.filled(source: source, into: trouAffiche), trouAffiche)
    }
}
