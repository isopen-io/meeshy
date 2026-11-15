import CoreGraphics

/// **Le point visé se lit sur l'image RÉELLEMENT affichée** (#9464).
///
/// L'aperçu système remplit la toile ; la vue Metal, elle, pose le canevas 9:16
/// par ajustement, et un cadre y loge l'image dans sa case. Convertir le toucher
/// par la couche système cachée visait donc à côté dès qu'un cadre était choisi.
/// Les deux montages passent par ces lois : l'image remplit sa cible (toute la
/// toile, ou la case), le capteur est couché, et l'avant se voit en miroir.
nonisolated enum ComposerCaptureFocusGeometry {

    /// L'image `source`, remplie dans `target` — sans déformation, centrée, débordant.
    static func filled(source: CGSize, into target: CGRect) -> CGRect {
        guard source.width > 0, source.height > 0 else { return target }
        let echelle = max(target.width / source.width, target.height / source.height)
        let taille = CGSize(width: source.width * echelle, height: source.height * echelle)
        return CGRect(x: target.midX - taille.width / 2, y: target.midY - taille.height / 2,
                      width: taille.width, height: taille.height)
    }

    /// Une case du canevas (repère haut-gauche), dans la vue où le canevas est ajusté.
    static func slotInView(_ slot: CGRect, canvas: CGSize, view: CGSize) -> CGRect {
        guard canvas.width > 0, canvas.height > 0 else { return slot }
        let echelle = min(view.width / canvas.width, view.height / canvas.height)
        let origine = CGPoint(x: (view.width - canvas.width * echelle) / 2,
                              y: (view.height - canvas.height * echelle) / 2)
        return CGRect(x: origine.x + slot.minX * echelle, y: origine.y + slot.minY * echelle,
                      width: slot.width * echelle, height: slot.height * echelle)
    }

    /// Le point d'intérêt du capteur (`0...1`, capteur couché), `nil` hors de l'image.
    static func devicePoint(viewPoint: CGPoint, imageRect: CGRect, mirrored: Bool) -> CGPoint? {
        guard imageRect.width > 0, imageRect.height > 0 else { return nil }
        let u = (viewPoint.x - imageRect.minX) / imageRect.width
        let v = (viewPoint.y - imageRect.minY) / imageRect.height
        guard (0...1).contains(u), (0...1).contains(v) else { return nil }
        return CGPoint(x: v, y: mirrored ? u : 1 - u)
    }
}
