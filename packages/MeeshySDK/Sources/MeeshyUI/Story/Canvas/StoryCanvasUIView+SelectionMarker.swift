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
/// ## Le cadre plein de la scène d'abord (#13839, L5 ; #14043)
///
/// La maquette validée le 2026-10-30 (état 3, « un élément sélectionné »)
/// redessine le marqueur : un **trait blanc de 2 pt, décalé de 3 pt**, aux
/// bornes RÉELLES du calque — rotation et échelle comprises —, sans poignées.
/// Le porteur l'a voulu PLEIN (#14043) : le pointillé reste aux guides (zone
/// sûre, magnétiques, alignement), il ne désigne jamais une sélection.
/// Les poignées et le cadre violet de la vue `1c` sont partis avec elle. Le
/// badge reste au contrat pour les hôtes qui le demandent ; la scène n'en
/// demande pas.
///
/// ## Plus aucun cadre (#14206)
///
/// Le porteur l'a retiré : la sélection change déjà le rail et le
/// toucher amène l'objet au premier plan. Seul le badge d'envoi reste, posé
/// au-dessus de l'objet.
///
/// Le badge est un chrome d'ÉDITION : il vit dans `editOverlayLayer`, que ni
/// l'export (`StoryExporter`), ni la vignette, ni le lecteur ne reconstruisent
/// — ils peignent la slide par `StoryRenderer`, jamais ce calque.
extension StoryCanvasUIView {

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
        // un objet vient d'être posé et n'a pas encore été mesuré.
        guard cible.frame.width > 0.5, cible.frame.height > 0.5 else { return }

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
