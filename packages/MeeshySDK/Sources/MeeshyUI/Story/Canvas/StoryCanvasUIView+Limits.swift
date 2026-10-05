import UIKit

// **Les LIMITES et les lignes MAGNÉTIQUES, pendant une manipulation** (#8370,
// directive porteur 2026-09-27).
//
// La scène se pose sur un sol peint de son propre thumbhash : son bord ne se
// voit plus, et un objet poussé au-delà se coupe sans que rien ne l'annonce.
// Pendant un déplacement, un pincement ou une rotation, le canvas trace donc le
// contour de la scène — là où le contenu se coupe — et les lignes sur lesquelles
// il s'accroche. La ligne ENGAGÉE garde son trait rose (`updateSnapGuides`) ;
// celles-ci disent où sont les autres. Au repos, rien ne se peint sur la scène.
//
// Extension à part, sans propriété stockée : le calque se retrouve par son NOM
// dans `editOverlayLayer`, ce qui évite d'ajouter à `StoryCanvasUIView.swift`,
// déjà au-delà du seuil de découpage.
extension StoryCanvasUIView {

    static let limitsLayerName = "story.canvas.manipulation.limits"

    /// Les lignes tracées sont les cibles du snap, et rien d'autre.
    nonisolated static var magneticLineTargets: [Double] { snapTargets }

    func showManipulationLimits() {
        guard bounds.size != .zero else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        hideManipulationLimits()

        let conteneur = CALayer()
        conteneur.name = Self.limitsLayerName
        conteneur.frame = bounds

        let lignes = UIBezierPath()
        for cible in Self.magneticLineTargets {
            let x = CGFloat(cible) * bounds.width
            lignes.move(to: CGPoint(x: x, y: 0))
            lignes.addLine(to: CGPoint(x: x, y: bounds.height))
            let y = CGFloat(cible) * bounds.height
            lignes.move(to: CGPoint(x: 0, y: y))
            lignes.addLine(to: CGPoint(x: bounds.width, y: y))
        }
        let magnetiques = CAShapeLayer()
        magnetiques.path = lignes.cgPath
        magnetiques.strokeColor = UIColor.white.withAlphaComponent(0.3).cgColor
        magnetiques.lineWidth = 0.5
        magnetiques.lineDashPattern = [2, 6]
        magnetiques.fillColor = UIColor.clear.cgColor

        let contour = CAShapeLayer()
        contour.path = UIBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1),
                                    cornerRadius: max(0, canvasCornerRadius - 1)).cgPath
        contour.strokeColor = UIColor.white.withAlphaComponent(0.9).cgColor
        contour.lineWidth = 2
        contour.fillColor = UIColor.clear.cgColor

        conteneur.addSublayer(magnetiques)
        conteneur.addSublayer(contour)
        editOverlayLayer.insertSublayer(conteneur, at: 0)
    }

    func hideManipulationLimits() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        editOverlayLayer.sublayers?
            .filter { $0.name == Self.limitsLayerName }
            .forEach { $0.removeFromSuperlayer() }
        CATransaction.commit()
    }
}
