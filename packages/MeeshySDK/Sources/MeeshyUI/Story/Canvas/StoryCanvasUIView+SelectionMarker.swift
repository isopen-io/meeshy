import UIKit
import QuartzCore
import MeeshySDK

// MARK: - StoryCanvasUIView + Marqueur de sélection

/// **Ce qui MONTRE l'objet sélectionné** (#4073, vue `1c`).
///
/// ## Ce que ce fichier répare
///
/// La vue `1c` de la planche s'appelle « Éditeur de scène — objet sélectionné »
/// et sa doctrine tient en une phrase : « Trois plans, **un seul objet à la
/// fois**. » Elle le dessine avec un cadre violet, quatre poignées d'angle, et
/// un badge `TEXT · PLAN FG · z 2` posé juste au-dessus.
///
/// Le canvas n'avait **aucune notion d'objet sélectionné**. L'inspecteur, les
/// contrôleurs du rail *trailing* et le menu d'appui long portaient tous sur un
/// objet que rien ne désignait à l'écran : le seul indice était que la rangée de
/// jetons changeait de contenu. Le doc-comment de `editOverlayLayer` promettait
/// pourtant « snap guides, **selection markers** » — depuis toujours, et seuls
/// les guides existaient.
///
/// ## Pourquoi le badge dit le PLAN et le Z
///
/// Ce n'est pas de la décoration technique. `bringForward` / `sendBackward`
/// vivent au rail *trailing*, mutent `zIndex` sur le modèle, et ne rendaient
/// **aucun retour** : l'auteur empilait à l'aveugle, et sur deux objets qui ne
/// se chevauchent pas, rien à l'écran ne bougeait. Un badge qui porte `z 2`
/// transforme une action muette en action lisible — dimension 8, « feedback
/// instantané », et loi 4 dans sa lecture positive.
///
/// ## Le repère
///
/// Les calques d'objet sont NOMMÉS par l'id de l'objet (c'est ce dont
/// `hitTestItem` se sert déjà), et `itemsContainer` comme `editOverlayLayer`
/// remplissent tous deux `bounds` — même espace de coordonnées, donc la `frame`
/// d'un calque d'objet s'y transpose telle quelle.
///
/// Le cadre est la **boîte englobante alignée sur les axes** (`layer.frame`),
/// y compris pour un objet tourné. C'est ce que `frame` rend d'un calque qui
/// porte une transformation, et c'est ce qu'un auteur lit comme « la place que
/// prend cet objet ». Un cadre tourné serait plus joli et dirait moins.
/// ## Le cadre pointillé de la scène d'abord (#13839, L5)
///
/// La maquette validée le 2026-10-30 (état 3, « un élément sélectionné »)
/// redessine le marqueur : un **pointillé blanc de 2 pt, décalé de 3 pt**, aux
/// bornes RÉELLES du calque — rotation et échelle comprises —, sans poignées.
/// Les poignées et le cadre violet de la vue `1c` sont partis avec elle. Le
/// badge reste au contrat pour les hôtes qui le demandent ; la scène n'en
/// demande pas.
///
/// Le cadre est un chrome d'ÉDITION : il vit dans `editOverlayLayer`, que ni
/// l'export (`StoryExporter`), ni la vignette, ni le lecteur ne reconstruisent
/// — ils peignent la slide par `StoryRenderer`, jamais ce calque.
extension StoryCanvasUIView {

    /// Le trait, son décalage hors du calque et son pointillé, en points d'écran.
    /// Le cadre vit dans `editOverlayLayer`, qui n'est PAS mis à l'échelle par la
    /// géométrie de rendu — ces valeurs sont donc lues telles quelles.
    static let selectionMarkerLineWidth: CGFloat = 2
    static let selectionMarkerOffset: CGFloat = 3
    static let selectionMarkerDash: [NSNumber] = [6, 4]
    /// La hauteur du badge, et le creux qui le sépare du cadre.
    static let selectionMarkerBadgeHeight: CGFloat = 18
    static let selectionMarkerBadgeGap: CGFloat = 6

    /// **Désigner l'objet sélectionné — ou n'en désigner aucun.**
    ///
    /// `nil` efface le marqueur : c'est l'état NOMINAL (rien n'est sélectionné),
    /// pas une erreur, et il ne laisse aucun résidu à l'écran.
    public func setSelectionMarker(id: String?, badge: String? = nil) {
        guard id != selectionMarkerId || badge != selectionMarkerBadge else { return }
        selectionMarkerId = id
        selectionMarkerBadge = badge
        refreshSelectionMarker()
    }

    /// Repose le marqueur sur la géométrie COURANTE.
    ///
    /// Appelée à chaque `rebuildLayers()` : les calques d'objet y sont détachés
    /// puis ré-attachés, et un marqueur posé une seule fois désignerait une
    /// frame périmée dès le premier déplacement. Le recalcul est le prix d'un
    /// cadre qui suit le doigt.
    func refreshSelectionMarker() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        hideSelectionMarker()
        guard let id = selectionMarkerId,
              let cible = itemsContainer.sublayers?.first(where: { $0.name == id })
        else { return }

        // Un calque de largeur ou de hauteur nulle existe pendant la fenêtre où
        // un objet vient d'être posé et n'a pas encore été mesuré. L'encadrer
        // peindrait un trait de zéro pixel — visible comme un artefact, jamais
        // comme une sélection.
        guard cible.frame.width > 0.5, cible.frame.height > 0.5 else { return }

        let cadre = CAShapeLayer()
        cadre.frame = editOverlayLayer.bounds
        cadre.path = StorySelectionFrame.path(bounds: cible.bounds, position: cible.position,
                                             anchorPoint: cible.anchorPoint,
                                             transform: cible.affineTransform(),
                                             offset: Self.selectionMarkerOffset)
        cadre.fillColor = nil
        cadre.strokeColor = UIColor.white.cgColor
        cadre.lineWidth = Self.selectionMarkerLineWidth
        cadre.lineDashPattern = Self.selectionMarkerDash
        cadre.lineJoin = .round
        // Une ombre douce garde le pointillé lisible sur un fond blanc.
        cadre.shadowColor = UIColor.black.cgColor
        cadre.shadowOpacity = 0.35
        cadre.shadowRadius = 1.5
        cadre.shadowOffset = .zero
        attachSelectionMarker(cadre)

        if let badge = selectionMarkerBadge, !badge.isEmpty,
           let calque = makeSelectionBadge(badge, above: cible.frame) {
            attachSelectionMarker(calque)
        }
    }

    func hideSelectionMarker() {
        selectionMarkerLayers.forEach { $0.removeFromSuperlayer() }
        selectionMarkerLayers.removeAll()
    }

    private func attachSelectionMarker(_ calque: CALayer) {
        editOverlayLayer.addSublayer(calque)
        selectionMarkerLayers.append(calque)
    }

    /// Le badge, posé AU-DESSUS du cadre — et rabattu DEDANS quand le cadre
    /// touche le haut de la scène. Un badge qui sort du canvas serait rogné par
    /// le masque et ne dirait plus rien ; le rabattre le garde lisible sans
    /// jamais recouvrir un autre objet que le sien.
    private func makeSelectionBadge(_ texte: String, above cadre: CGRect) -> CALayer? {
        let police = UIFont.monospacedDigitSystemFont(ofSize: 9, weight: .semibold)
        let attributs: [NSAttributedString.Key: Any] = [.font: police,
                                                        .foregroundColor: Self.selectionMarkerTint,
                                                        .kern: 0.7]
        let mesure = (texte as NSString).size(withAttributes: attributs)
        guard mesure.width > 0 else { return nil }

        let hauteur = Self.selectionMarkerBadgeHeight
        let largeur = ceil(mesure.width) + 14
        let dessus = cadre.minY - hauteur - Self.selectionMarkerBadgeGap
        let y = dessus >= 0 ? dessus : cadre.minY + Self.selectionMarkerBadgeGap

        let calque = CATextLayer()
        calque.frame = CGRect(x: cadre.minX, y: y, width: largeur, height: hauteur)
        calque.string = NSAttributedString(string: texte, attributes: attributs)
        calque.alignmentMode = .center
        calque.backgroundColor = UIColor(white: 0.043, alpha: 0.75).cgColor
        calque.cornerRadius = 5
        calque.contentsScale = traitCollection.storyCanvasDisplayScale
        return calque
    }

    /// L'indigo de la marque. Le cadre de sélection n'est PAS une couleur de
    /// contexte de conversation : il désigne un objet dans un éditeur, où la
    /// teinte doit rester la même d'une publication à l'autre pour que le geste
    /// s'apprenne.
    static var selectionMarkerTint: UIColor {
        UIColor(red: 0.561, green: 0.490, blue: 0.973, alpha: 1)
    }
}

/// **Le cadre de la sélection, en géométrie pure** (#13839, L5).
nonisolated enum StorySelectionFrame {

    /// **Le contour, aux bornes réelles du calque** — un rectangle tourné de
    /// l'angle du calque, agrandi par son échelle, décalé de `offset` points
    /// d'ÉCRAN vers l'extérieur (une échelle ×2 ne double pas le décalage).
    ///
    /// Les quatre arguments sont ceux d'un `CALayer` : la boîte `frame` d'un
    /// calque tourné est sa boîte englobante alignée sur les axes, qui dirait
    /// « la place prise » et non « l'objet ».
    static func path(bounds: CGRect, position: CGPoint, anchorPoint: CGPoint,
                     transform: CGAffineTransform, offset: CGFloat) -> CGPath {
        let angle = atan2(transform.b, transform.a)
        let echelleX = hypot(transform.a, transform.b)
        let echelleY = hypot(transform.c, transform.d)
        let centreLocal = CGPoint(x: (0.5 - anchorPoint.x) * bounds.width,
                                  y: (0.5 - anchorPoint.y) * bounds.height)
        let centre = CGPoint(x: position.x + centreLocal.x * transform.a + centreLocal.y * transform.c + transform.tx,
                             y: position.y + centreLocal.x * transform.b + centreLocal.y * transform.d + transform.ty)
        let largeur = bounds.width * echelleX + 2 * offset
        let hauteur = bounds.height * echelleY + 2 * offset
        var pose = CGAffineTransform(translationX: centre.x, y: centre.y).rotated(by: angle)
        let rect = CGRect(x: -largeur / 2, y: -hauteur / 2, width: largeur, height: hauteur)
        let rayon = min(6, largeur / 2, hauteur / 2)
        return CGPath(roundedRect: rect, cornerWidth: rayon, cornerHeight: rayon, transform: &pose)
    }
}
